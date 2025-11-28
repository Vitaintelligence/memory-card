
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameMode, GameState, GameStatus, Player, CardType, ThemeResponse } from './types';
import { generateThemeDeck } from './services/geminiService';
import { Lobby } from './components/Lobby';
import { Button } from './components/Button';
import { Card as CardComponent } from './components/Card';
import { multiplayer, NetworkMessage } from './services/multiplayerService';
import { ArrowLeft, Trophy, Copy, Wifi, Loader2, Radio, Eye, AlertTriangle } from 'lucide-react';

const COLORS = ['bg-neo-primary', 'bg-neo-accent', 'bg-neo-secondary', 'bg-green-400', 'bg-blue-400', 'bg-red-400', 'bg-pink-400', 'bg-indigo-400', 'bg-orange-400', 'bg-teal-400'];

// Initialize empty to prevent "Lobby Full" false positives
const INITIAL_PLAYERS: Player[] = [];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    status: GameStatus.LOBBY,
    mode: GameMode.SOLO,
    deckTheme: '',
    turnCount: 0,
    currentPlayerIndex: 0,
    winner: null,
    roomId: '',
    region: '',
    maxPlayers: 2
  });

  const [cards, setCards] = useState<CardType[]>([]);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiMemory, setAiMemory] = useState<Map<string, number>>(new Map());
  const [loadingMessage, setLoadingMessage] = useState("Summoning AI...");
  const [onlineRole, setOnlineRole] = useState<'HOST' | 'GUEST' | 'SPECTATOR' | null>(null);
  const [currentUser, setCurrentUser] = useState('');
  
  // UI States
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Ref to hold current state for the network callback
  const stateRef = useRef({ gameState, cards, players, flippedIndices, isProcessing, onlineRole });

  useEffect(() => {
    stateRef.current = { gameState, cards, players, flippedIndices, isProcessing, onlineRole };
  }, [gameState, cards, players, flippedIndices, isProcessing, onlineRole]);

  // Failsafe: Reset processing if stuck for too long (5s)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (isProcessing) {
        timeout = setTimeout(() => {
            console.warn("Auto-releasing stuck processing lock");
            setIsProcessing(false);
        }, 5000);
    }
    return () => clearTimeout(timeout);
  }, [isProcessing]);

  // Robust Quit Handler
  const handleQuit = useCallback((notify: boolean = true) => {
      // 1. Snapshot current state for logic
      const currentMode = stateRef.current.gameState.mode;
      const currentRole = stateRef.current.onlineRole;
      const myClientId = multiplayer.getClientId();

      // 2. Network Cleanup (Fire and Forget)
      try {
        if (notify && currentMode === GameMode.ONLINE_PVP) {
            if (currentRole === 'HOST') {
                multiplayer.send('QUIT', {}); // Host kills room
            } else if (currentRole === 'GUEST') {
                multiplayer.send('PLAYER_LEFT', { playerId: myClientId });
            }
        }
        multiplayer.leaveRoom();
      } catch (e) {
        console.error("Network cleanup failed, forcing UI reset", e);
      }

      // 3. UI State Reset
      setOnlineRole(null);
      setCards([]);
      setFlippedIndices([]);
      setAiMemory(new Map());
      setIsProcessing(false);
      setPlayers([]); 
      setShowQuitConfirm(false);
      
      const newGameState = {
          status: GameStatus.LOBBY,
          mode: GameMode.SOLO,
          deckTheme: '',
          turnCount: 0,
          currentPlayerIndex: 0,
          winner: null,
          roomId: '',
          region: '',
          maxPlayers: 2
      };
      
      setGameState(newGameState);
      // Force update ref immediately
      stateRef.current = { 
          gameState: newGameState, 
          cards: [], 
          players: [], 
          flippedIndices: [], 
          isProcessing: false, 
          onlineRole: null 
      };

  }, []);

  // Network Message Handler
  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
    const current = stateRef.current;
    
    // HOST: Handle Join Request
    if (msg.type === 'JOIN_REQUEST') {
        // Check if we are in a state to accept players
        if (current.gameState.status === GameStatus.WAITING_FOR_PLAYER || (current.onlineRole === 'HOST' && current.gameState.status === GameStatus.GENERATING)) {
            
            // Check if player is ALREADY joined
            const existingPlayer = current.players.find(p => p.clientId === msg.senderId);
            
            if (existingPlayer) {
                // IMPORTANT: If they are already joined, RESEND the update. 
                // They might be retrying because they missed the first ack.
                multiplayer.send('LOBBY_UPDATE', { players: current.players });
                return;
            }

            if (current.players.length >= (current.gameState.maxPlayers || 2)) {
                console.log("Rejecting join: Lobby Full", current.players.length, current.gameState.maxPlayers);
                return;
            }

            const guestName = msg.payload.guestName || `Player ${current.players.length + 1}`;
            const newPlayerId = current.players.length + 1;
            const newPlayer: Player = {
                id: newPlayerId,
                clientId: msg.senderId,
                name: guestName,
                score: 0,
                color: COLORS[(newPlayerId - 1) % COLORS.length],
                isLocal: false
            };

            const updatedPlayers = [...current.players, newPlayer];
            setPlayers(updatedPlayers);
            
            // Manual Ref Update to prevent race conditions on rapid joins
            stateRef.current.players = updatedPlayers;

            // Sync everyone
            multiplayer.send('LOBBY_UPDATE', { players: updatedPlayers });
            
            // Advertise new count
            multiplayer.startAdvertising(
                current.gameState.roomId!, 
                current.gameState.deckTheme, 
                updatedPlayers[0].name, 
                'OPEN',
                updatedPlayers.length,
                current.gameState.maxPlayers || 2
            );
        }
    } 
    // GUEST: Handle Lobby Update
    else if (msg.type === 'LOBBY_UPDATE') {
        if (current.gameState.status === GameStatus.WAITING_FOR_PLAYER || current.gameState.status === GameStatus.GENERATING) {
             const serverPlayers = msg.payload.players as Player[];
             const myClientId = multiplayer.getClientId();
             
             // Map isLocal based on Client ID
             const mappedPlayers = serverPlayers.map(p => ({
                 ...p,
                 isLocal: p.clientId === myClientId
             }));
             
             // Update players list
             setPlayers(mappedPlayers);
             
             // If we were waiting/connecting, this confirms we are IN.
             if (current.gameState.status === GameStatus.WAITING_FOR_PLAYER) {
                 setLoadingMessage("Connected! Waiting for host...");
             }
        }
    }
    // GAME START
    else if (msg.type === 'WELCOME') {
        if (current.gameState.status === GameStatus.GENERATING || current.gameState.status === GameStatus.WAITING_FOR_PLAYER) {
            const { deck, theme, players } = msg.payload;
            const myClientId = multiplayer.getClientId();
            
            const mappedPlayers = players.map((p: Player) => ({
                ...p,
                isLocal: p.clientId === myClientId
            }));

            setCards(deck);
            setPlayers(mappedPlayers);
            setGameState(prev => ({ 
                ...prev, 
                status: GameStatus.PLAYING, 
                deckTheme: theme 
            }));
        }
    }
    // MOVE
    else if (msg.type === 'MOVE') {
        const { cardId } = msg.payload;
        const cardIndex = current.cards.findIndex(c => c.id === cardId);
        
        if (cardIndex !== -1 && !current.cards[cardIndex].isFlipped && !current.isProcessing) {
             triggerRemoteReveal(cardIndex);
        }
    }
    // PLAYER LEFT
    else if (msg.type === 'PLAYER_LEFT') {
        if (current.onlineRole === 'HOST') {
            const leavingClientId = msg.payload.playerId;
            const updatedPlayers = current.players.filter(p => p.clientId !== leavingClientId);
            
            if (current.gameState.status === GameStatus.WAITING_FOR_PLAYER) {
                setPlayers(updatedPlayers);
                stateRef.current.players = updatedPlayers;
                
                multiplayer.send('LOBBY_UPDATE', { players: updatedPlayers });
                multiplayer.startAdvertising(
                    current.gameState.roomId!, 
                    current.gameState.deckTheme, 
                    updatedPlayers[0].name, 
                    'OPEN',
                    updatedPlayers.length,
                    current.gameState.maxPlayers || 2
                );
            } else {
                alert("A player has disconnected.");
            }
        }
    }
    // HOST QUIT
    else if (msg.type === 'QUIT') {
        if (current.onlineRole !== 'HOST') {
            alert("Host has closed the room.");
            handleQuit(false); // Don't notify back
        }
    }
    // SPECTATOR LOGIC
    else if (msg.type === 'SPECTATE_REQUEST') {
        if (current.onlineRole === 'HOST') {
             multiplayer.send('GAME_SNAPSHOT', {
                 deck: current.cards,
                 theme: current.gameState.deckTheme,
                 players: current.players,
                 status: current.gameState.status,
                 turnIndex: current.gameState.currentPlayerIndex
             });
        }
    }
    else if (msg.type === 'GAME_SNAPSHOT') {
        if (current.onlineRole === 'SPECTATOR') {
             const { deck, theme, players, status, turnIndex } = msg.payload;
             setCards(deck);
             setPlayers(players);
             setGameState(prev => ({
                 ...prev,
                 status: status,
                 deckTheme: theme,
                 currentPlayerIndex: turnIndex
             }));
        }
    }
  }, [handleQuit]);

  const triggerRemoteReveal = (index: number) => {
      setCards(prev => {
          const newCards = [...prev];
          newCards[index].isFlipped = true;
          return newCards;
      });
      setFlippedIndices(prev => [...prev, index]);
  };

  useEffect(() => {
    multiplayer.setListener(handleNetworkMessage);
    return () => {
        multiplayer.removeListener(); 
    };
  }, [handleNetworkMessage]);

  const resetGame = useCallback((mode: GameMode = GameMode.SOLO, themeName: string, userName: string, roomConfig?: { roomId: string; isHost: boolean; isSpectator?: boolean; maxPlayers?: number }) => {
    const region = multiplayer.getRegion();
    setCurrentUser(userName);
    const myClientId = multiplayer.getClientId();

    const newGameState = {
      status: GameStatus.GENERATING,
      mode,
      deckTheme: themeName,
      turnCount: 0,
      currentPlayerIndex: 0,
      winner: null,
      roomId: roomConfig?.roomId || '',
      region,
      maxPlayers: roomConfig?.maxPlayers || 2
    };

    setGameState(newGameState);
    setCards([]);
    setFlippedIndices([]);
    setAiMemory(new Map());
    setIsProcessing(false);
    
    // Default players setup (overwritten below for online)
    let initialPlayers: Player[] = [];

    if (mode === GameMode.ONLINE_PVP && roomConfig) {
        multiplayer.joinRoom(roomConfig.roomId);
        
        if (roomConfig.isSpectator) {
            setOnlineRole('SPECTATOR');
            setPlayers([]); // Waiting for snapshot
            setLoadingMessage("Connecting to stream...");
            
            // Manual Ref Update
            stateRef.current = { 
                gameState: newGameState, cards: [], players: [], flippedIndices: [], isProcessing: false, onlineRole: 'SPECTATOR' 
            };

            setTimeout(() => {
                multiplayer.send('SPECTATE_REQUEST', {});
            }, 500);
            return;
        }

        const role = roomConfig.isHost ? 'HOST' : 'GUEST';
        setOnlineRole(role);
        
        if (roomConfig.isHost) {
             const hostPlayer: Player = { 
                 id: 1, 
                 clientId: myClientId,
                 name: userName, 
                 score: 0, 
                 color: COLORS[0], 
                 isLocal: true 
             };
             initialPlayers = [hostPlayer];
             setPlayers(initialPlayers);
             
             // Important: Set status to WAITING immediately for ref, even if state update lags
             const waitingState = { ...newGameState, status: GameStatus.WAITING_FOR_PLAYER };
             setGameState(waitingState);
             
             // Manual Ref Update: THIS IS CRITICAL FOR RACE CONDITIONS
             stateRef.current = { 
                 gameState: waitingState, cards: [], players: initialPlayers, flippedIndices: [], isProcessing: false, onlineRole: 'HOST' 
             };

             // Advertise
             multiplayer.startAdvertising(roomConfig.roomId, themeName, userName, 'OPEN', 1, roomConfig.maxPlayers || 2);
        } else {
            // Guest join logic
            const guestPlayerPlaceholder: Player = { 
                id: 2, 
                clientId: myClientId,
                name: userName, 
                score: 0, 
                color: COLORS[1], 
                isLocal: true 
             };
            initialPlayers = [guestPlayerPlaceholder];
            setPlayers(initialPlayers);
            setLoadingMessage("Connecting to Host...");
            
            const waitingState = { ...newGameState, status: GameStatus.WAITING_FOR_PLAYER };
            setGameState(waitingState);

            // Manual Ref Update
             stateRef.current = { 
                 gameState: waitingState, cards: [], players: initialPlayers, flippedIndices: [], isProcessing: false, onlineRole: 'GUEST' 
             };

            // Retry join logic
            let attempts = 0;
            const joinInterval = setInterval(() => {
                const current = stateRef.current;
                
                // Stop trying if we are already playing, lobby is loaded (players > 1), or too many attempts
                const amIConnected = current.players.some(p => p.clientId === myClientId && current.players.length > 1);
                
                if (attempts > 20 || current.gameState.status === GameStatus.PLAYING || amIConnected) {
                    clearInterval(joinInterval);
                    return;
                }
                
                // Send join request
                multiplayer.send('JOIN_REQUEST', { guestName: userName });
                attempts++;
            }, 800); // Slightly slower interval to avoid flooding, but reliable
        }
    } else {
        // Setup local players
        if (mode === GameMode.SOLO) {
          initialPlayers = [{ id: 1, name: userName, score: 0, color: COLORS[0] }];
        } else if (mode === GameMode.LOCAL_PVP) {
          initialPlayers = [
            { id: 1, name: 'Player 1', score: 0, color: COLORS[0] },
            { id: 2, name: 'Player 2', score: 0, color: COLORS[1] }
          ];
        } else if (mode === GameMode.VS_AI) {
          initialPlayers = [
            { id: 1, name: userName, score: 0, color: COLORS[0] },
            { id: 2, name: 'Gemini AI', score: 0, color: 'bg-neo-dark text-white', isAi: true }
          ];
        }
        setPlayers(initialPlayers);
        setGameState(prev => ({ ...prev, status: GameStatus.GENERATING }));
        
        // Manual Ref Update
        stateRef.current = { 
            gameState: { ...newGameState, status: GameStatus.GENERATING }, 
            cards: [], 
            players: initialPlayers, 
            flippedIndices: [], 
            isProcessing: false, 
            onlineRole: null 
        };
    }
  }, []);

  const hostStartGame = async () => {
      setGameState(prev => ({ ...prev, status: GameStatus.GENERATING }));
  };

  useEffect(() => {
    if (gameState.status === GameStatus.GENERATING) {
      if (gameState.mode === GameMode.ONLINE_PVP && onlineRole !== 'HOST') return;

      const initDeck = async () => {
        setLoadingMessage("Constructing Deck...");
        
        const playerCount = players.length;
        const pairCount = Math.max(8, 8 + (playerCount - 2) * 2);

        const themeData: ThemeResponse = await generateThemeDeck(gameState.deckTheme, pairCount);
        
        const newCards: CardType[] = [];
        themeData.items.forEach((item, index) => {
           const color = themeData.backgroundColorPalette[index % themeData.backgroundColorPalette.length];
           newCards.push({ id: `card-${index}-a`, content: item, isFlipped: false, isMatched: false, color });
           newCards.push({ id: `card-${index}-b`, content: item, isFlipped: false, isMatched: false, color });
        });

        for (let i = newCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newCards[i], newCards[j]] = [newCards[j], newCards[i]];
        }

        setCards(newCards);
        setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));

        if (gameState.mode === GameMode.ONLINE_PVP && onlineRole === 'HOST') {
            multiplayer.send('WELCOME', { 
                deck: newCards, 
                theme: gameState.deckTheme,
                players: players 
            });

            multiplayer.startAdvertising(gameState.roomId!, gameState.deckTheme, players[0].name, 'PLAYING', players.length, gameState.maxPlayers || 2);
        }
      };
      initDeck();
    }
  }, [gameState.status, gameState.deckTheme, gameState.mode, onlineRole, gameState.roomId]);

  const handleCardClick = (clickedCard: CardType) => {
    if (gameState.status !== GameStatus.PLAYING || isProcessing) return;
    if (onlineRole === 'SPECTATOR') return;

    if (gameState.mode === GameMode.ONLINE_PVP) {
        const currentPlayer = players[gameState.currentPlayerIndex];
        if (!currentPlayer.isLocal) return;
    }

    if (clickedCard.isFlipped || clickedCard.isMatched) return;

    const currentPlayer = players[gameState.currentPlayerIndex];
    if (currentPlayer.isAi) return;

    if (gameState.mode === GameMode.ONLINE_PVP) {
        multiplayer.send('MOVE', { cardId: clickedCard.id });
    }

    revealCard(clickedCard);
  };

  const revealCard = (cardToReveal: CardType) => {
    const cardIndex = cards.findIndex(c => c.id === cardToReveal.id);
    if (cardIndex === -1) return;

    if (players[gameState.currentPlayerIndex]?.isAi) {
        setAiMemory(prev => {
            const newMem = new Map(prev);
            newMem.set(cardToReveal.id, cardIndex);
            return newMem;
        });
    }

    setCards(prev => {
        const newCards = [...prev];
        newCards[cardIndex].isFlipped = true;
        return newCards;
    });

    setFlippedIndices(prev => [...prev, cardIndex]);
  };

  useEffect(() => {
      if (gameState.status !== GameStatus.PLAYING && gameState.status !== GameStatus.GAME_OVER) return;

      if (flippedIndices.length === 2 && !isProcessing) {
          setIsProcessing(true);
          const [idx1, idx2] = flippedIndices;
          const card1 = cards[idx1];
          const card2 = cards[idx2];
          
          if (!card1 || !card2) {
              setIsProcessing(false);
              setFlippedIndices([]);
              return;
          }

          const isMatch = card1.content === card2.content;

          setTimeout(() => {
              // Check if game still active (user didn't quit during timeout)
              if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;

              let nextPlayers = [...stateRef.current.players];
              let nextCards = [...stateRef.current.cards];
              let switchTurn = true;

              if (isMatch) {
                  // Re-verify indices for safety
                  if (nextCards[idx1] && nextCards[idx2]) {
                    nextCards[idx1].isMatched = true;
                    nextCards[idx2].isMatched = true;
                    if(nextPlayers[gameState.currentPlayerIndex]) {
                        nextPlayers[gameState.currentPlayerIndex].score += 1;
                    }
                  }
                  switchTurn = false; 
                  
                  if (nextCards.every(c => c.isMatched)) {
                      handleGameOver(nextPlayers);
                  }
              } else {
                  if (nextCards[idx1]) nextCards[idx1].isFlipped = false;
                  if (nextCards[idx2]) nextCards[idx2].isFlipped = false;
              }

              setCards(nextCards);
              setPlayers(nextPlayers);
              setFlippedIndices([]);
              setIsProcessing(false);

              if (switchTurn && !nextCards.every(c => c.isMatched)) {
                  advanceTurn();
              } else if (!switchTurn && gameState.mode === GameMode.VS_AI && players[gameState.currentPlayerIndex].isAi) {
                  setTimeout(aiTurn, 1000);
              }
          }, 1000);
      }
  }, [flippedIndices, cards, players, gameState.currentPlayerIndex, gameState.mode, gameState.status]);

  const advanceTurn = () => {
    setGameState(prev => {
      const nextIndex = (prev.currentPlayerIndex + 1) % players.length;
      return { ...prev, currentPlayerIndex: nextIndex, turnCount: prev.turnCount + 1 };
    });
  };

  // AI Logic Trigger
  useEffect(() => {
      if (gameState.status === GameStatus.PLAYING && 
          gameState.mode === GameMode.VS_AI && 
          players[gameState.currentPlayerIndex]?.isAi && 
          !isProcessing && 
          flippedIndices.length === 0) {
          setTimeout(aiTurn, 1000);
      }
  }, [gameState.currentPlayerIndex, gameState.status, isProcessing, flippedIndices.length]);

  const aiTurn = useCallback(() => {
    if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;
    
    const currentCards = stateRef.current.cards;
    const availableIndices = currentCards.map((c, i) => i).filter(i => !currentCards[i].isMatched && !currentCards[i].isFlipped);
    
    if (availableIndices.length === 0) return;

    const validMemory: {index: number, content: string}[] = [];
    aiMemory.forEach((index, id) => {
        if (currentCards[index] && !currentCards[index].isMatched) {
            validMemory.push({ index, content: currentCards[index].content });
        }
    });

    const memoryByContent = new Map<string, number[]>();
    validMemory.forEach(item => {
        const list = memoryByContent.get(item.content) || [];
        list.push(item.index);
        memoryByContent.set(item.content, list);
    });

    let firstMoveIndex = -1;
    let secondMoveIndex = -1;

    // 1. Find Pair in Memory
    for (const [_, indices] of memoryByContent.entries()) {
        if (indices.length === 2) {
            firstMoveIndex = indices[0];
            secondMoveIndex = indices[1];
            break;
        }
    }

    // 2. Random First if no pair
    if (firstMoveIndex === -1) {
        firstMoveIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    }

    const performAiMoves = async () => {
        if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;
        
        // --- MOVE 1 ---
        revealCardAi(firstMoveIndex);
        
        await new Promise(r => setTimeout(r, 1000));
        if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;

        // Deciding Move 2
        if (secondMoveIndex === -1) {
             const freshCards = stateRef.current.cards;
             const firstCard = freshCards[firstMoveIndex]; 
             const matchInMemory = validMemory.find(m => m.content === firstCard.content && m.index !== firstMoveIndex);
             
             if (matchInMemory) {
                 secondMoveIndex = matchInMemory.index;
             } else {
                 const remainingIndices = availableIndices.filter(i => i !== firstMoveIndex);
                 if (remainingIndices.length > 0) {
                    secondMoveIndex = remainingIndices[Math.floor(Math.random() * remainingIndices.length)];
                 }
             }
        }
        
        // Failsafe: If logic failed to pick a second card, pick ANY valid random card
        // This prevents the AI from getting stuck with 1 card flipped
        if (secondMoveIndex === -1 || secondMoveIndex === firstMoveIndex) {
            const freshCards = stateRef.current.cards;
            const valid = freshCards.map((c,i) => i).filter(i => !freshCards[i].isMatched && !freshCards[i].isFlipped && i !== firstMoveIndex);
            if (valid.length > 0) {
                secondMoveIndex = valid[Math.floor(Math.random() * valid.length)];
            } else {
                 // No moves left? Should not happen if game not over.
                 return; 
            }
        }

        // --- MOVE 2 ---
        if (secondMoveIndex !== -1) {
            revealCardAi(secondMoveIndex);
        }
    };
    performAiMoves();
  }, [aiMemory]);

  const revealCardAi = (index: number) => {
      setCards(prev => {
          const newCards = [...prev];
          if (newCards[index]) newCards[index].isFlipped = true;
          return newCards;
      });
      setFlippedIndices(prev => [...prev, index]);
  };

  const handleGameOver = (finalPlayers: Player[]) => {
    let winner: Player | 'DRAW' | null = null;
    const maxScore = Math.max(...finalPlayers.map(p => p.score));
    const topPlayers = finalPlayers.filter(p => p.score === maxScore);
    
    if (topPlayers.length > 1) {
        winner = 'DRAW';
    } else {
        winner = topPlayers[0];
    }
    setGameState(prev => ({ ...prev, status: GameStatus.GAME_OVER, winner }));
    multiplayer.stopAdvertising();
  };

  const currentPlayer = players[gameState.currentPlayerIndex];
  const isMyTurn = gameState.mode === GameMode.ONLINE_PVP 
    ? (currentPlayer?.isLocal || false)
    : true; 

  const getGridStyle = () => {
      const count = cards.length;
      if (count <= 16) return { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' };
      if (count <= 24) return { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' };
      if (count <= 32) return { gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' };
      return { gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' };
  };

  // Render Section
  return (
    <>
      {/* QUIT CONFIRMATION MODAL - Mounted at root to prevent z-index issues */}
      {showQuitConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white border-4 border-black p-6 rounded-xl shadow-neo-lg max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
             <div className="flex items-center gap-2 mb-4 text-red-600">
                <AlertTriangle size={32} />
                <h3 className="text-xl font-black uppercase">Abort Mission?</h3>
             </div>
             <p className="mb-6 font-medium text-gray-800">
               {gameState.mode === GameMode.ONLINE_PVP ? "Disconnecting will end the session for you." : "Current progress will be lost."}
             </p>
             <div className="flex gap-4">
                <Button fullWidth variant="secondary" onClick={() => setShowQuitConfirm(false)}>CANCEL</Button>
                <Button fullWidth variant="primary" className="bg-red-500 text-white hover:bg-red-600" onClick={() => handleQuit(true)}>QUIT</Button>
             </div>
          </div>
        </div>
      )}

      <div className="min-h-screen p-4 md:p-8 flex flex-col max-w-6xl mx-auto relative">
        {gameState.status === GameStatus.LOBBY ? (
           <Lobby onStart={resetGame} />
        ) : gameState.status === GameStatus.GENERATING ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <Loader2 className="animate-spin text-neo-primary mb-6" size={64} />
              <h2 className="text-3xl font-bold text-center animate-pulse">{loadingMessage}</h2>
              {gameState.mode === GameMode.ONLINE_PVP && onlineRole === 'GUEST' && (
                  <Button variant="outline" className="mt-8" onClick={() => setShowQuitConfirm(true)}>Cancel Join</Button>
              )}
            </div>
        ) : gameState.status === GameStatus.WAITING_FOR_PLAYER ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-neo-bg">
              <div className="bg-white border-4 border-black p-8 rounded-2xl shadow-neo-lg text-center max-w-lg w-full relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-neo-primary via-neo-secondary to-neo-accent animate-pulse"></div>
                  <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2 bg-black text-white px-2 py-1 rounded text-xs font-mono">
                          <Radio size={12} className="animate-pulse text-red-500" /> ON-AIR
                      </div>
                      <div className="text-xs font-bold text-gray-500">REGION: {gameState.region}</div>
                  </div>

                  <h2 className="text-3xl font-black mb-1">WAITING ROOM</h2>
                  <p className="text-sm font-bold text-neo-primary mb-6 uppercase tracking-widest">{gameState.deckTheme} THEME</p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-8">
                      {players.map((p) => (
                          <div key={p.id} className={`flex items-center gap-2 border-2 border-black p-2 rounded ${p.isLocal ? 'bg-gray-100' : 'bg-white'}`}>
                              <div className={`w-8 h-8 rounded-full border-2 border-black ${p.color} flex items-center justify-center text-xs font-bold`}>
                                  {p.name.substring(0,1)}
                              </div>
                              <span className="font-bold truncate">{p.name} {p.isLocal ? '(You)' : ''}</span>
                          </div>
                      ))}
                      
                      {Array.from({ length: (gameState.maxPlayers || 2) - players.length }).map((_, i) => (
                          <div key={`empty-${i}`} className="border-2 border-dashed border-gray-300 p-2 rounded flex items-center justify-center gap-2 opacity-50">
                              <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                              <span className="text-xs italic">Waiting...</span>
                          </div>
                      ))}
                  </div>

                  <div className="bg-gray-100 p-4 border-2 border-black rounded mb-6 text-left">
                      <p className="font-bold text-sm mb-2">ACCESS CODE</p>
                      <div className="flex gap-2">
                          <div className="flex-1 bg-white border-2 border-black p-2 font-mono text-center text-2xl font-bold tracking-[0.2em]">{gameState.roomId}</div>
                          <button className="bg-neo-secondary border-2 border-black p-2 hover:bg-yellow-300" onClick={() => navigator.clipboard.writeText(gameState.roomId || '')}><Copy size={24}/></button>
                      </div>
                  </div>

                  {onlineRole === 'HOST' ? (
                      <div className="flex flex-col gap-2">
                          <Button 
                              fullWidth 
                              disabled={players.length < 2} 
                              onClick={hostStartGame}
                          >
                              START GAME ({players.length}/{gameState.maxPlayers})
                          </Button>
                          <Button variant="outline" fullWidth onClick={() => setShowQuitConfirm(true)}>Cancel Broadcast</Button>
                      </div>
                  ) : (
                      <div className="text-center">
                          <p className="text-sm font-bold mb-4 animate-pulse">Waiting for Host to start...</p>
                          <Button variant="outline" fullWidth onClick={() => setShowQuitConfirm(true)}>Leave Room</Button>
                      </div>
                  )}
              </div>
          </div>
        ) : (
          <>
              {/* HEADER */}
              <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 z-50 relative">
                  <Button variant="outline" size="sm" onClick={() => setShowQuitConfirm(true)}>
                  <ArrowLeft size={20} /> Quit
                  </Button>

                  <div className="flex-1 overflow-x-auto max-w-full px-2">
                      <div className="bg-white border-4 border-black px-6 py-3 rounded-xl shadow-neo flex items-center gap-4 min-w-max">
                      {players.map((p, idx) => (
                          <div key={p.id} className={`flex items-center gap-2 ${gameState.currentPlayerIndex === idx ? 'opacity-100 scale-110 font-black' : 'opacity-50'} transition-all`}>
                              <div className={`w-4 h-4 rounded-full border-2 border-black ${p.color}`}></div>
                              <span className="text-sm md:text-xl">{p.name} {p.isLocal ? '(You)' : ''}: {p.score}</span>
                          </div>
                      ))}
                      </div>
                  </div>
                  
                  {gameState.mode === GameMode.ONLINE_PVP && (
                      <div className="bg-black text-white px-3 py-1 rounded font-mono text-xs flex items-center gap-2 uppercase whitespace-nowrap">
                          {onlineRole === 'SPECTATOR' ? <Eye size={14} className="text-yellow-400"/> : <Wifi size={14} className="text-green-400" />} 
                          {onlineRole === 'HOST' ? 'HOSTING' : onlineRole === 'SPECTATOR' ? 'SPECTATING' : 'CONNECTED'}
                      </div>
                  )}
              </div>
              
              {gameState.mode === GameMode.ONLINE_PVP && (
                  <div className="text-center mb-4 h-10 relative z-30">
                      {onlineRole === 'SPECTATOR' ? (
                          <span className="bg-yellow-300 text-black px-6 py-2 rounded-lg font-bold text-sm inline-block border-2 border-black">
                              OBSERVING MATCH
                          </span>
                      ) : isMyTurn ? (
                          <span className="bg-neo-primary text-white px-6 py-2 rounded-lg font-bold text-lg animate-bounce inline-block shadow-neo-sm border-2 border-black">YOUR TURN</span>
                      ) : (
                          <span className="bg-gray-200 text-gray-500 px-4 py-2 rounded-lg font-bold text-sm inline-block border-2 border-gray-400 flex items-center gap-2 mx-auto w-fit">
                              <Loader2 className="animate-spin" size={14}/> {players[gameState.currentPlayerIndex]?.name} is thinking...
                          </span>
                      )}
                  </div>
              )}

              {/* GAME BOARD */}
              <div className={`flex-1 flex items-center justify-center mb-8 transition-opacity ${(!isMyTurn && gameState.mode === GameMode.ONLINE_PVP && onlineRole !== 'SPECTATOR') ? 'opacity-70 pointer-events-none grayscale-[0.5]' : ''}`}>
                  <div 
                      className={`grid gap-3 md:gap-4 w-full ${onlineRole === 'SPECTATOR' ? 'pointer-events-none' : ''}`}
                      style={getGridStyle()}
                  >
                  {cards.map((card) => (
                      <CardComponent 
                      key={card.id} 
                      card={card} 
                      onClick={handleCardClick} 
                      disabled={isProcessing} 
                      />
                  ))}
                  </div>
              </div>

              {/* GAME OVER MODAL */}
              {gameState.status === GameStatus.GAME_OVER && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="bg-white border-4 border-black p-8 rounded-2xl shadow-neo-lg max-w-md w-full text-center animate-bounce-in">
                      <Trophy size={64} className="mx-auto mb-4 text-neo-secondary drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]" />
                      <h2 className="text-4xl font-black mb-2">GAME OVER</h2>
                      
                      {gameState.winner === 'DRAW' ? (
                          <p className="text-2xl font-bold mb-6">It's a Draw!</p>
                      ) : (
                          <p className="text-2xl font-bold mb-6">
                          <span className={`px-2 py-1 ${typeof gameState.winner !== 'string' ? gameState.winner?.color : ''} border-2 border-black text-white rounded mr-2`}>
                              {typeof gameState.winner !== 'string' ? gameState.winner?.name : ''}
                          </span>
                          Wins!
                          </p>
                      )}

                      <div className="flex flex-col gap-3">
                          {gameState.mode !== GameMode.ONLINE_PVP && onlineRole !== 'SPECTATOR' && (
                              <Button fullWidth onClick={() => resetGame(gameState.mode, gameState.deckTheme, currentUser)}>Play Again</Button>
                          )}
                          <Button fullWidth variant="outline" onClick={() => handleQuit(true)}>Back to Lobby</Button>
                      </div>
                  </div>
                  </div>
              )}
          </>
        )}
      </div>
    </>
  );
}
