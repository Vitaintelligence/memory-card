
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameMode, GameState, GameStatus, Player, CardType, ThemeResponse } from './types';
import { generateThemeDeck } from './services/geminiService';
import { Lobby } from './components/Lobby';
import { Button } from './components/Button';
import { Card as CardComponent } from './components/Card';
import { multiplayer, NetworkMessage } from './services/multiplayerService';
import { ArrowLeft, Trophy, Copy, Wifi, Loader2, Radio, Eye, AlertTriangle, RefreshCw, Signal, Share2, Activity } from 'lucide-react';

const COLORS = ['bg-neo-primary', 'bg-neo-accent', 'bg-neo-secondary', 'bg-green-400', 'bg-blue-400', 'bg-red-400', 'bg-pink-400', 'bg-indigo-400', 'bg-orange-400', 'bg-teal-400'];

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
  const [connectionHealth, setConnectionHealth] = useState<'good' | 'pending' | 'connecting' | 'error'>('good');
  const [ping, setPing] = useState(0);
  
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const stateRef = useRef({ gameState, cards, players, flippedIndices, isProcessing, onlineRole });

  useEffect(() => {
    stateRef.current = { gameState, cards, players, flippedIndices, isProcessing, onlineRole };
  }, [gameState, cards, players, flippedIndices, isProcessing, onlineRole]);

  // Ping Updater
  useEffect(() => {
    if (gameState.mode === GameMode.ONLINE_PVP) {
        const interval = setInterval(() => {
            setPing(multiplayer.getLatency());
        }, 1000);
        return () => clearInterval(interval);
    }
  }, [gameState.mode]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (isProcessing) {
        timeout = setTimeout(() => {
            setIsProcessing(false);
        }, 5000);
    }
    return () => clearTimeout(timeout);
  }, [isProcessing]);

  const handleQuit = useCallback((notify: boolean = true) => {
      const currentMode = stateRef.current.gameState.mode;
      const currentRole = stateRef.current.onlineRole;
      const myClientId = multiplayer.getClientId();

      try {
        if (notify && currentMode === GameMode.ONLINE_PVP) {
            if (currentRole === 'HOST') {
                multiplayer.send('QUIT', {}); 
            } else if (currentRole === 'GUEST') {
                multiplayer.send('PLAYER_LEFT', { playerId: myClientId });
            }
        }
        multiplayer.leaveRoom();
      } catch (e) {
        console.error("Network cleanup failed", e);
      }

      setOnlineRole(null);
      setCards([]);
      setFlippedIndices([]);
      setAiMemory(new Map());
      setIsProcessing(false);
      setPlayers([]); 
      setShowQuitConfirm(false);
      setConnectionHealth('good');
      setPing(0);
      
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
      stateRef.current = { 
          gameState: newGameState, 
          cards: [], 
          players: [], 
          flippedIndices: [], 
          isProcessing: false, 
          onlineRole: null 
      };
  }, []);

  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
    const current = stateRef.current;
    
    // HOST: Handle Join
    if (msg.type === 'JOIN_REQUEST') {
        if (current.gameState.status === GameStatus.WAITING_FOR_PLAYER || (current.onlineRole === 'HOST' && current.gameState.status === GameStatus.GENERATING)) {
            const existingPlayer = current.players.find(p => p.clientId === msg.senderId);
            if (existingPlayer) {
                multiplayer.send('LOBBY_UPDATE', { players: current.players });
                return;
            }

            if (current.players.length >= (current.gameState.maxPlayers || 2)) {
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
            stateRef.current.players = updatedPlayers;
            multiplayer.send('LOBBY_UPDATE', { players: updatedPlayers });
            
            // Also advertise locally
            multiplayer.startAdvertising(
                current.gameState.roomId!, 
                current.gameState.deckTheme, 
                current.players[0].name, 
                'OPEN',
                updatedPlayers.length,
                current.gameState.maxPlayers || 2
            );
        }
    }

    if (msg.type === 'LOBBY_UPDATE') {
        if (current.onlineRole === 'GUEST' || current.onlineRole === 'SPECTATOR') {
            const newPlayers = msg.payload.players.map((p: Player) => ({
                ...p,
                isLocal: p.clientId === multiplayer.getClientId()
            }));
            setPlayers(newPlayers);
            const amIInList = newPlayers.some((p: any) => p.clientId === multiplayer.getClientId());
            if (amIInList) setConnectionHealth('good');
        }
    }

    if (msg.type === 'MOVE') {
       if (current.gameState.status === GameStatus.PLAYING) {
           const { cardId } = msg.payload;
           const cardToFlip = current.cards.find(c => c.id === cardId);
           if (cardToFlip) handleCardClick(cardToFlip, true);
       }
    }

    if (msg.type === 'GAME_SNAPSHOT') {
        if (current.onlineRole === 'SPECTATOR') {
            setGameState(prev => ({
                ...prev,
                status: msg.payload.status,
                deckTheme: msg.payload.deckTheme,
                currentPlayerIndex: msg.payload.currentPlayerIndex,
                maxPlayers: msg.payload.players.length
            }));
            setPlayers(msg.payload.players.map((p: Player) => ({...p, isLocal: false})));
            setCards(msg.payload.cards);
        }
    }

    if (msg.type === 'SPECTATE_REQUEST') {
        if (current.onlineRole === 'HOST') {
            multiplayer.send('GAME_SNAPSHOT', {
                status: current.gameState.status,
                deckTheme: current.gameState.deckTheme,
                currentPlayerIndex: current.gameState.currentPlayerIndex,
                players: current.players,
                cards: current.cards
            });
        }
    }

    if (msg.type === 'PLAYER_LEFT') {
        const leftPlayerId = msg.payload.playerId;
        if (current.onlineRole === 'HOST' && current.gameState.status === GameStatus.WAITING_FOR_PLAYER) {
            const updated = current.players.filter(p => p.clientId !== leftPlayerId);
            setPlayers(updated);
            multiplayer.send('LOBBY_UPDATE', { players: updated });
        } else if (current.gameState.status === GameStatus.PLAYING) {
             alert("A player has disconnected!");
        }
    }

    if (msg.type === 'QUIT') {
        if (current.onlineRole !== 'HOST') {
            alert("Host ended the session.");
            handleQuit(false);
        }
    }

    if (msg.type === 'WELCOME') {
        setGameState(prev => ({
            ...prev,
            status: GameStatus.PLAYING,
            deckTheme: msg.payload.theme,
            roomId: msg.payload.roomId,
            maxPlayers: msg.payload.maxPlayers
        }));
        setCards(msg.payload.cards);
        if (msg.payload.players) {
             const finalPlayers = msg.payload.players.map((p: Player) => ({
                ...p,
                isLocal: p.clientId === multiplayer.getClientId()
            }));
            setPlayers(finalPlayers);
        }
    }
  }, [handleQuit]);

  useEffect(() => {
    multiplayer.setListener(handleNetworkMessage);
  }, [handleNetworkMessage]);

  const startGame = async (mode: GameMode, theme: string, userName: string, roomConfig?: any) => {
    setCards([]);
    setFlippedIndices([]);
    setAiMemory(new Map());
    
    const localPlayer: Player = {
        id: 1,
        clientId: multiplayer.getClientId(),
        name: userName,
        score: 0,
        color: COLORS[0],
        isLocal: true,
        isAi: false
    };

    setCurrentUser(userName);

    if (mode === GameMode.ONLINE_PVP) {
        if (roomConfig?.isSpectator) {
             setOnlineRole('SPECTATOR');
             setGameState({
                status: GameStatus.WAITING_FOR_PLAYER,
                mode: mode,
                deckTheme: theme,
                turnCount: 0,
                currentPlayerIndex: 0,
                winner: null,
                roomId: roomConfig.roomId,
                region: multiplayer.getRegion(),
                maxPlayers: 2
            });
            // Try connect
            setConnectionHealth('connecting');
            try {
                await multiplayer.connectToRoom(roomConfig.roomId);
                setConnectionHealth('good');
                multiplayer.send('SPECTATE_REQUEST', { guestName: userName });
            } catch (e) {
                alert("Could not connect to room: " + e);
                handleQuit(false);
            }
            return;
        }

        if (roomConfig?.isHost) {
            setOnlineRole('HOST');
            setPlayers([localPlayer]);
            setGameState({
                status: GameStatus.WAITING_FOR_PLAYER,
                mode: mode,
                deckTheme: theme,
                turnCount: 0,
                currentPlayerIndex: 0,
                winner: null,
                roomId: roomConfig.roomId,
                region: multiplayer.getRegion(),
                maxPlayers: roomConfig.maxPlayers || 2
            });
            
            multiplayer.startAdvertising(
                roomConfig.roomId, 
                theme, 
                userName, 
                'OPEN', 
                1, 
                roomConfig.maxPlayers || 2
            );

            stateRef.current = {
                ...stateRef.current,
                onlineRole: 'HOST',
                players: [localPlayer],
                gameState: {
                   ...stateRef.current.gameState,
                   status: GameStatus.WAITING_FOR_PLAYER,
                   roomId: roomConfig.roomId,
                   maxPlayers: roomConfig.maxPlayers || 2
                }
            };
        } else {
            // Guest Joining
            setOnlineRole('GUEST');
            setConnectionHealth('connecting');
            setPlayers([]); 
            setGameState({
                status: GameStatus.WAITING_FOR_PLAYER,
                mode: mode,
                deckTheme: theme,
                turnCount: 0,
                currentPlayerIndex: 0,
                winner: null,
                roomId: roomConfig.roomId,
                region: multiplayer.getRegion(),
                maxPlayers: 2
            });
            
            try {
                await multiplayer.connectToRoom(roomConfig.roomId);
                setConnectionHealth('pending');
                multiplayer.send('JOIN_REQUEST', { guestName: userName });
            } catch (e) {
                if (e === 'TIMEOUT') {
                    alert("Connection timed out. The room code might be wrong, or the host is behind a strict firewall.");
                } else {
                    alert("Failed to join: " + e);
                }
                handleQuit(false);
            }
        }
    } else {
        const p2Name = mode === GameMode.VS_AI ? 'Gemini AI' : 'Player 2';
        const p2: Player = {
            id: 2,
            name: p2Name,
            score: 0,
            color: COLORS[1],
            isAi: mode === GameMode.VS_AI,
            isLocal: mode === GameMode.LOCAL_PVP || mode === GameMode.VS_AI
        };
        
        setPlayers([localPlayer, p2]);
        setGameState({
            status: GameStatus.GENERATING,
            mode: mode,
            deckTheme: theme,
            turnCount: 0,
            currentPlayerIndex: 0,
            winner: null,
            roomId: '',
            region: '',
            maxPlayers: 2
        });

        generateCards(theme, 2);
    }
  };

  const generateCards = async (theme: string, playerCount: number) => {
    setLoadingMessage(`Generating ${theme} cards...`);
    const pairs = 8 + (playerCount - 2) * 2;
    const data: ThemeResponse = await generateThemeDeck(theme, pairs);
    
    let deck: CardType[] = [];
    data.items.forEach((item, index) => {
      const color = data.backgroundColorPalette[index % data.backgroundColorPalette.length];
      deck.push({ id: `card-${index}-a`, content: item, isFlipped: false, isMatched: false, color });
      deck.push({ id: `card-${index}-b`, content: item, isFlipped: false, isMatched: false, color });
    });
    deck = deck.sort(() => Math.random() - 0.5);

    setCards(deck);
    setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));

    if (stateRef.current.onlineRole === 'HOST') {
        multiplayer.send('WELCOME', { 
            theme: theme, 
            roomId: stateRef.current.gameState.roomId,
            cards: deck,
            players: stateRef.current.players,
            maxPlayers: stateRef.current.gameState.maxPlayers
        });
        
         multiplayer.startAdvertising(
            stateRef.current.gameState.roomId!, 
            theme, 
            stateRef.current.players[0].name, 
            'PLAYING',
            stateRef.current.players.length,
            stateRef.current.gameState.maxPlayers || 2
        );
    }
  };

  const handleStartOnlineGame = () => {
      if (onlineRole === 'HOST') {
          generateCards(gameState.deckTheme, players.length);
      }
  };

  useEffect(() => {
    if (gameState.mode === GameMode.VS_AI && 
        players[gameState.currentPlayerIndex]?.isAi && 
        gameState.status === GameStatus.PLAYING && 
        !isProcessing) {
      
      const performAiMove = async () => {
        await new Promise(r => setTimeout(r, 1000));
        if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;
        
        const validCards = stateRef.current.cards.filter(c => !c.isFlipped && !c.isMatched);
        if (validCards.length === 0) return;

        let firstCard: CardType | undefined;
        let secondCard: CardType | undefined;
        firstCard = validCards[Math.floor(Math.random() * validCards.length)];
        handleCardClick(firstCard);

        await new Promise(r => setTimeout(r, 1000));
        const currentCards = stateRef.current.cards;
        const firstCardContent = firstCard.content;
        const pair = currentCards.find(c => c.content === firstCardContent && c.id !== firstCard.id && !c.isMatched);
        
        if (pair && Math.random() > 0.6) {
            secondCard = pair;
        } else {
            const remaining = currentCards.filter(c => !c.isFlipped && !c.isMatched && c.id !== firstCard!.id);
            secondCard = remaining[Math.floor(Math.random() * remaining.length)];
        }

        if (secondCard) handleCardClick(secondCard);
      };
      performAiMove();
    }
  }, [gameState.currentPlayerIndex, gameState.status, isProcessing]);

  const handleCardClick = (card: CardType, isRemote: boolean = false) => {
    if (gameState.status !== GameStatus.PLAYING) return;
    if (isProcessing && !isRemote) return;
    if (gameState.mode === GameMode.ONLINE_PVP) {
        if (onlineRole === 'SPECTATOR') return;
        const isMyTurn = players[gameState.currentPlayerIndex].clientId === multiplayer.getClientId();
        if (!isMyTurn && !isRemote) return;
        if (isMyTurn && !isRemote) multiplayer.send('MOVE', { cardId: card.id });
    } else if (players[gameState.currentPlayerIndex].isAi && !isRemote) {
        return; 
    }
    if (card.isFlipped || card.isMatched) return;

    const newCards = [...cards];
    const cardIndex = newCards.findIndex(c => c.id === card.id);
    newCards[cardIndex].isFlipped = true;
    setCards(newCards);
    const newFlipped = [...flippedIndices, cardIndex];
    setFlippedIndices(newFlipped);
    setAiMemory(prev => new Map(prev).set(card.id, cardIndex)); 

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      checkForMatch(newFlipped, newCards);
    }
  };

  const checkForMatch = (indices: number[], currentCards: CardType[]) => {
    const [idx1, idx2] = indices;
    const card1 = currentCards[idx1];
    const card2 = currentCards[idx2];

    if (card1.content === card2.content) {
      setTimeout(() => {
        if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;

        const matchedCards = [...currentCards];
        matchedCards[idx1].isMatched = true;
        matchedCards[idx2].isMatched = true;
        matchedCards[idx1].isFlipped = true;
        matchedCards[idx2].isFlipped = true;
        
        setCards(matchedCards);
        setFlippedIndices([]);
        setIsProcessing(false);

        setPlayers(prev => {
          const newPlayers = [...prev];
          newPlayers[gameState.currentPlayerIndex].score += 1;
          return newPlayers;
        });

        if (matchedCards.every(c => c.isMatched)) {
            setGameState(prev => {
                const winner = players.reduce((prev, current) => (prev.score > current.score) ? prev : current); 
                return { ...prev, status: GameStatus.GAME_OVER, winner: winner };
            });
        }
      }, 500);
    } else {
      setTimeout(() => {
        if (stateRef.current.gameState.status !== GameStatus.PLAYING) return;
        const resetCards = [...currentCards];
        resetCards[idx1].isFlipped = false;
        resetCards[idx2].isFlipped = false;
        setCards(resetCards);
        setFlippedIndices([]);
        setIsProcessing(false);
        const totalPlayers = stateRef.current.players.length || 2;
        setGameState(prev => ({ ...prev, currentPlayerIndex: (prev.currentPlayerIndex + 1) % totalPlayers }));
      }, 1000);
    }
  };

  const gridCols = cards.length > 24 ? 'grid-cols-6 md:grid-cols-8' : cards.length > 16 ? 'grid-cols-5 md:grid-cols-6' : 'grid-cols-4';

  if (gameState.status === GameStatus.LOBBY) {
    return <Lobby onStart={startGame} />;
  }

  if (gameState.status === GameStatus.GENERATING) {
     return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
             <Loader2 size={64} className="animate-spin text-neo-primary mb-4" />
             <h2 className="text-2xl font-bold animate-pulse">{loadingMessage}</h2>
        </div>
     );
  }

  if (gameState.status === GameStatus.WAITING_FOR_PLAYER) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-2xl mx-auto">
              <div className="bg-white border-4 border-black p-8 rounded-xl w-full shadow-neo-lg text-center">
                  <div className="flex justify-center items-center gap-2 mb-4">
                    <div className="inline-block bg-black text-white px-4 py-2 font-mono text-2xl font-bold rounded tracking-widest border-2 border-white shadow-lg">
                        {gameState.roomId}
                    </div>
                  </div>
                  
                  {onlineRole === 'HOST' && (
                       <p className="text-sm text-gray-500 mb-6 flex items-center justify-center gap-1">
                          <Share2 size={12} /> SHARE THIS CODE TO PLAY ONLINE
                       </p>
                  )}

                  <h2 className="text-3xl font-bold mb-2">
                      {onlineRole === 'HOST' ? 'WAITING FOR PLAYERS' : 'CONNECTING...'}
                  </h2>
                  
                  {onlineRole === 'GUEST' && (
                      <div className={`flex items-center justify-center gap-2 mb-6 font-mono text-sm border-2 border-black p-2 rounded ${connectionHealth === 'good' ? 'bg-green-100 text-green-800' : connectionHealth === 'error' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {connectionHealth === 'good' ? (
                             <><Wifi size={16}/> SECURE LINK ESTABLISHED ({ping}ms)</>
                          ) : connectionHealth === 'error' ? (
                             <><AlertTriangle size={16} /> CONNECTION FAILED</>
                          ) : (
                             <><Loader2 size={16} className="animate-spin"/> CONNECTING TO HOST...</>
                          )}
                      </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 mb-8">
                      {players.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 border-2 border-black rounded shadow-neo bg-white">
                              <div className={`w-4 h-4 rounded-full border border-black ${p.color.replace('bg-', 'bg-')}`} style={{backgroundColor: p.color.replace('bg-', '')}}></div>
                              <span className="font-bold">{p.name} {p.isLocal ? '(YOU)' : ''}</span>
                          </div>
                      ))}
                      {Array.from({length: Math.max(0, (gameState.maxPlayers || 2) - players.length)}).map((_, i) => (
                          <div key={`ph-${i}`} className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-300 rounded opacity-50">
                              <div className="w-4 h-4 rounded-full bg-gray-200"></div>
                              <span className="italic">Waiting...</span>
                          </div>
                      ))}
                  </div>

                  <div className="flex flex-col gap-3">
                      {onlineRole === 'HOST' ? (
                        <Button onClick={handleStartOnlineGame} disabled={players.length < 2} fullWidth>
                            {players.length < 2 ? 'WAITING FOR OPPONENT...' : 'START MATCH'}
                        </Button>
                      ) : (
                         <div className="flex gap-2">
                             <Button disabled fullWidth className="bg-gray-100 border-gray-400">WAITING FOR HOST...</Button>
                         </div>
                      )}
                      
                      <Button variant="outline" onClick={() => handleQuit(true)} fullWidth>CANCEL</Button>
                  </div>
              </div>
          </div>
      );
  }

  if (gameState.status === GameStatus.GAME_OVER) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
         <div className="bg-white border-4 border-black p-8 rounded-2xl shadow-neo-lg text-center max-w-md w-full relative overflow-hidden">
            <div className="absolute inset-0 bg-yellow-400 opacity-20 transform -skew-y-12 scale-150"></div>
            <Trophy size={64} className="mx-auto text-yellow-500 mb-4 drop-shadow-lg relative z-10" />
            <h1 className="text-4xl font-black mb-2 relative z-10">GAME OVER!</h1>
            <div className="text-2xl font-bold mb-6 relative z-10">
               {gameState.winner ? `${gameState.winner.name} Wins!` : "It's a Draw!"}
            </div>
            <div className="space-y-2 mb-8 relative z-10">
                {players.map(p => (
                    <div key={p.id} className="flex justify-between border-b-2 border-black pb-1">
                        <span>{p.name}</span>
                        <span className="font-mono font-bold">{p.score} pts</span>
                    </div>
                ))}
            </div>
            <div className="flex gap-4 relative z-10">
                <Button fullWidth onClick={() => handleQuit(true)}>BACK TO LOBBY</Button>
            </div>
         </div>
      </div>
    );
  }

  const currentPlayer = players[gameState.currentPlayerIndex];

  return (
    <>
        {showQuitConfirm && (
            <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white border-4 border-black shadow-neo-lg p-6 rounded-xl max-w-sm w-full animate-in fade-in zoom-in duration-200">
                    <div className="flex items-center gap-3 mb-4 text-red-600">
                        <AlertTriangle size={32} />
                        <h3 className="text-xl font-black uppercase">Abort Mission?</h3>
                    </div>
                    <p className="font-bold mb-6">You are about to leave the current game.</p>
                    <div className="flex gap-3">
                        <Button variant="outline" fullWidth onClick={() => setShowQuitConfirm(false)}>RESUME</Button>
                        <Button variant="primary" className="bg-red-500 hover:bg-red-600" fullWidth onClick={() => handleQuit(true)}>QUIT</Button>
                    </div>
                </div>
            </div>
        )}

        <div className="min-h-screen flex flex-col p-2 md:p-4 max-w-7xl mx-auto relative z-0">
        <header className="flex justify-between items-center mb-4 bg-white border-4 border-black p-3 rounded-xl shadow-neo relative z-40">
            <div className="flex items-center gap-2 md:gap-4">
            <Button size="sm" variant="outline" onClick={() => setShowQuitConfirm(true)}><ArrowLeft size={20} /></Button>
            <div className="hidden md:block font-bold text-xl uppercase tracking-tighter">{gameState.deckTheme} Match</div>
            </div>

            <div className="flex gap-4 items-center">
            {players.map((p, idx) => (
                <div key={p.id} className={`flex flex-col items-center transition-all ${gameState.currentPlayerIndex === idx ? 'scale-110' : 'opacity-60 grayscale'}`}>
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-black flex items-center justify-center font-bold text-white shadow-sm ${p.color}`}>
                    {p.name.charAt(0)}
                </div>
                <span className="text-xs font-bold mt-1 bg-white px-1 border border-black rounded">{p.score}</span>
                </div>
            ))}
            </div>

            {gameState.mode === GameMode.ONLINE_PVP && (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded border border-gray-300 text-xs font-mono mr-2">
                         <Activity size={10} className={ping > 150 ? 'text-red-500' : 'text-green-500'} />
                         {ping}ms
                    </div>
                    <div className="bg-black text-white px-2 py-1 rounded text-xs font-mono hidden md:block">
                        {gameState.roomId}
                    </div>
                </div>
            )}
        </header>

        <div className="text-center mb-4 font-bold text-xl py-2 rounded-lg border-2 border-black transition-colors duration-300 shadow-neo-sm"
            style={{ backgroundColor: currentPlayer?.color.replace('bg-', 'var(--tw-colors-') || '#fff', color: 'white', textShadow: '1px 1px 0 #000' }}>
            {currentPlayer?.name}'s Turn {currentPlayer?.isLocal && "(YOU)"}
        </div>

        <main className={`flex-1 grid gap-2 md:gap-4 ${gridCols} auto-rows-fr pb-4`}>
            {cards.map((card) => (
            <CardComponent key={card.id} card={card} onClick={handleCardClick} disabled={isProcessing} />
            ))}
        </main>
        </div>
    </>
  );
}
