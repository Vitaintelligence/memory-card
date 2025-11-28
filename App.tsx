
import React, { useState, useEffect, useCallback } from 'react';
import { GameMode, GameState, GameStatus, Player, CardType, ThemeResponse } from './types';
import { generateThemeDeck } from './services/geminiService';
import { Lobby } from './components/Lobby';
import { Button } from './components/Button';
import { Card as CardComponent } from './components/Card';
import { multiplayer, NetworkMessage } from './services/multiplayerService';
import { ArrowLeft, RefreshCw, Trophy, Copy, Users } from 'lucide-react';

const INITIAL_PLAYERS: Player[] = [
  { id: 1, name: 'Player 1', score: 0, color: 'bg-neo-primary' },
  { id: 2, name: 'Player 2', score: 0, color: 'bg-neo-accent' }
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    status: GameStatus.LOBBY,
    mode: GameMode.SOLO,
    deckTheme: '',
    turnCount: 0,
    currentPlayerIndex: 0,
    winner: null,
    roomId: '',
    region: ''
  });

  const [cards, setCards] = useState<CardType[]>([]);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiMemory, setAiMemory] = useState<Map<string, number>>(new Map());
  const [loadingMessage, setLoadingMessage] = useState("Summoning AI...");
  const [onlineRole, setOnlineRole] = useState<'HOST' | 'GUEST' | null>(null);

  // Setup Multiplayer Listeners
  useEffect(() => {
    multiplayer.setCallback(handleNetworkMessage);
    return () => multiplayer.close();
  }, [gameState.status, cards, players]); // Re-bind when state refs might be stale (simplified, better to use refs for state in callbacks)

  // Use refs for state accessed in network callback to avoid stale closures
  const stateRef = React.useRef({ gameState, cards, players, flippedIndices, isProcessing });
  useEffect(() => {
    stateRef.current = { gameState, cards, players, flippedIndices, isProcessing };
  }, [gameState, cards, players, flippedIndices, isProcessing]);

  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
    const current = stateRef.current;
    
    if (msg.type === 'JOIN_REQUEST' && current.gameState.status === GameStatus.WAITING_FOR_PLAYER) {
        // Host received join request
        // Send WELCOME with initial state
        const deck = current.cards;
        multiplayer.send('WELCOME', { 
            deck, 
            theme: current.gameState.deckTheme,
            players: current.players 
        });
        
        setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));
    } 
    else if (msg.type === 'WELCOME') {
        // Guest received game data
        const { deck, theme, players } = msg.payload;
        setCards(deck);
        setPlayers(players); // Sync initial players
        setGameState(prev => ({ 
            ...prev, 
            status: GameStatus.PLAYING, 
            deckTheme: theme 
        }));
    }
    else if (msg.type === 'MOVE') {
        // Received opponent move
        const { cardId } = msg.payload;
        // Find card index
        const cardIndex = current.cards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
            handleRemoteReveal(cardIndex);
        }
    }
    else if (msg.type === 'RESTART') {
        window.location.reload(); // Simple sync restart
    }
  }, []);

  const handleRemoteReveal = (index: number) => {
      setCards(prev => {
          const newCards = [...prev];
          newCards[index].isFlipped = true;
          return newCards;
      });
      setFlippedIndices(prev => {
         const newIndices = [...prev, index];
         if (newIndices.length === 2) {
             setIsProcessing(true);
             // Trigger check match
             // We need to use a timeout to let the UI update first
             setTimeout(() => checkMatch(newIndices, stateRef.current.cards), 100); 
         }
         return newIndices;
      });
  };

  const resetGame = useCallback((mode: GameMode = GameMode.SOLO, themeName: string, roomConfig?: { roomId: string; isHost: boolean }) => {
    const region = multiplayer.getRegion();
    setGameState({
      status: GameStatus.GENERATING,
      mode,
      deckTheme: themeName,
      turnCount: 0,
      currentPlayerIndex: 0,
      winner: null,
      roomId: roomConfig?.roomId || '',
      region
    });
    setCards([]);
    setFlippedIndices([]);
    setAiMemory(new Map());
    setIsProcessing(false);
    
    if (mode === GameMode.ONLINE_PVP && roomConfig) {
        multiplayer.setRoomId(roomConfig.roomId);
        setOnlineRole(roomConfig.isHost ? 'HOST' : 'GUEST');
        
        const hostPlayer: Player = { id: 1, name: 'Host (P1)', score: 0, color: 'bg-neo-primary', isLocal: roomConfig.isHost };
        const guestPlayer: Player = { id: 2, name: 'Guest (P2)', score: 0, color: 'bg-neo-accent', isLocal: !roomConfig.isHost };
        setPlayers([hostPlayer, guestPlayer]);

        if (!roomConfig.isHost) {
            // Guest logic: Wait for Welcome
            setLoadingMessage("Connecting to Room...");
            setGameState(prev => ({ ...prev, status: GameStatus.GENERATING, roomId: roomConfig.roomId }));
            // Send join request repeatedly until connected
            const joinInterval = setInterval(() => {
                if (stateRef.current.gameState.status === GameStatus.PLAYING) clearInterval(joinInterval);
                multiplayer.send('JOIN_REQUEST', {}, 'guest');
            }, 1000);
            
            // Cleanup interval if component unmounts or state changes
            return;
        }
    } else {
        // Setup local players
        let newPlayers: Player[] = [];
        if (mode === GameMode.SOLO) {
          newPlayers = [{ id: 1, name: 'You', score: 0, color: 'bg-neo-primary' }];
        } else if (mode === GameMode.LOCAL_PVP) {
          newPlayers = [
            { id: 1, name: 'Player 1', score: 0, color: 'bg-neo-primary' },
            { id: 2, name: 'Player 2', score: 0, color: 'bg-neo-accent' }
          ];
        } else if (mode === GameMode.VS_AI) {
          newPlayers = [
            { id: 1, name: 'You', score: 0, color: 'bg-neo-primary' },
            { id: 2, name: 'Gemini AI', score: 0, color: 'bg-neo-dark text-white', isAi: true }
          ];
        }
        setPlayers(newPlayers);
    }
  }, []);

  // Initialize Deck (Only for Host or Local games)
  useEffect(() => {
    if (gameState.status === GameStatus.GENERATING && (onlineRole === 'HOST' || gameState.mode !== GameMode.ONLINE_PVP)) {
      const initDeck = async () => {
        setLoadingMessage(`Consulting the oracle for "${gameState.deckTheme}"...`);
        const themeData: ThemeResponse = await generateThemeDeck(gameState.deckTheme);
        
        const newCards: CardType[] = [];
        themeData.items.forEach((item, index) => {
           const color = themeData.backgroundColorPalette[index % themeData.backgroundColorPalette.length];
           newCards.push({ id: `card-${index}-a`, content: item, isFlipped: false, isMatched: false, color });
           newCards.push({ id: `card-${index}-b`, content: item, isFlipped: false, isMatched: false, color });
        });

        // Shuffle
        for (let i = newCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newCards[i], newCards[j]] = [newCards[j], newCards[i]];
        }

        setCards(newCards);
        
        if (gameState.mode === GameMode.ONLINE_PVP) {
            setGameState(prev => ({ ...prev, status: GameStatus.WAITING_FOR_PLAYER }));
        } else {
            setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));
        }
      };
      initDeck();
    }
  }, [gameState.status, gameState.deckTheme, gameState.mode, onlineRole]);

  // Handle Card Click
  const handleCardClick = (clickedCard: CardType) => {
    if (gameState.status !== GameStatus.PLAYING || isProcessing) return;
    
    // Online Turn Check
    if (gameState.mode === GameMode.ONLINE_PVP) {
        const currentPlayer = players[gameState.currentPlayerIndex];
        if (!currentPlayer.isLocal) {
            // Not my turn
            return;
        }
    }

    if (clickedCard.isFlipped || clickedCard.isMatched) return;

    // AI Turn Check
    const currentPlayer = players[gameState.currentPlayerIndex];
    if (currentPlayer.isAi) return;

    // If Online, broadcast move
    if (gameState.mode === GameMode.ONLINE_PVP) {
        multiplayer.send('MOVE', { cardId: clickedCard.id });
    }

    revealCard(clickedCard);
  };

  const revealCard = (cardToReveal: CardType) => {
    const cardIndex = cards.findIndex(c => c.id === cardToReveal.id);
    if (cardIndex === -1) return;

    setAiMemory(prev => {
        const newMem = new Map(prev);
        newMem.set(cardToReveal.id, cardIndex);
        return newMem;
    });

    const newCards = [...cards];
    newCards[cardIndex].isFlipped = true;
    setCards(newCards);

    const newFlippedIndices = [...flippedIndices, cardIndex];
    setFlippedIndices(newFlippedIndices);

    if (newFlippedIndices.length === 2) {
      setIsProcessing(true);
      checkMatch(newFlippedIndices, newCards);
    }
  };

  const checkMatch = (indices: number[], currentCards: CardType[]) => {
    const [idx1, idx2] = indices;
    const card1 = currentCards[idx1];
    const card2 = currentCards[idx2];
    
    const isMatch = card1.content === card2.content;

    setTimeout(() => {
      let nextPlayers = [...players];
      let nextCards = [...currentCards];
      let switchTurn = true;

      if (isMatch) {
        nextCards[idx1].isMatched = true;
        nextCards[idx2].isMatched = true;
        
        // Correctly identify who made the move based on current turn, not strictly local/remote logic here 
        // (state is synced so currentPlayerIndex is consistent)
        nextPlayers[gameState.currentPlayerIndex].score += 1;
        switchTurn = false; 
        
        if (nextCards.every(c => c.isMatched)) {
           handleGameOver(nextPlayers);
        }
      } else {
        nextCards[idx1].isFlipped = false;
        nextCards[idx2].isFlipped = false;
      }

      setCards(nextCards);
      setPlayers(nextPlayers);
      setFlippedIndices([]);
      setIsProcessing(false);

      if (switchTurn && !nextCards.every(c => c.isMatched)) {
         advanceTurn();
      } else if (!switchTurn && gameState.mode === GameMode.VS_AI && players[gameState.currentPlayerIndex].isAi && !nextCards.every(c => c.isMatched)) {
         setTimeout(aiTurn, 1000);
      }
    }, 1000);
  };

  const advanceTurn = () => {
    setGameState(prev => {
      const nextIndex = (prev.currentPlayerIndex + 1) % players.length;
      return { ...prev, currentPlayerIndex: nextIndex, turnCount: prev.turnCount + 1 };
    });
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
  };

  const aiTurn = useCallback(() => {
    if (gameState.status !== GameStatus.PLAYING) return;
    
    const availableIndices = cards.map((c, i) => i).filter(i => !cards[i].isMatched && !cards[i].isFlipped);
    if (availableIndices.length === 0) return;

    const validMemory: {index: number, content: string}[] = [];
    aiMemory.forEach((index, id) => {
        if (!cards[index].isMatched) {
            validMemory.push({ index, content: cards[index].content });
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

    for (const [_, indices] of memoryByContent.entries()) {
        if (indices.length === 2) {
            firstMoveIndex = indices[0];
            secondMoveIndex = indices[1];
            break;
        }
    }

    if (firstMoveIndex === -1) {
        const unknownIndices = availableIndices.filter(idx => !validMemory.some(m => m.index === idx));
        if (unknownIndices.length > 0) {
            const r = Math.floor(Math.random() * unknownIndices.length);
            firstMoveIndex = unknownIndices[r];
        } else {
             const r = Math.floor(Math.random() * availableIndices.length);
             firstMoveIndex = availableIndices[r];
        }
    }

    const performAiMoves = async () => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 800));
        revealCardAi(firstMoveIndex);
        await new Promise(r => setTimeout(r, 1000));

        const firstCard = cards[firstMoveIndex];
        const matchInMemory = validMemory.find(m => m.content === firstCard.content && m.index !== firstMoveIndex);
        
        if (matchInMemory) {
            secondMoveIndex = matchInMemory.index;
        } else if (secondMoveIndex === -1) {
             const remainingIndices = availableIndices.filter(i => i !== firstMoveIndex);
             const r = Math.floor(Math.random() * remainingIndices.length);
             secondMoveIndex = remainingIndices[r];
        }
        revealCardAi(secondMoveIndex);
    };
    performAiMoves();
  }, [cards, aiMemory, gameState.status]);

  const revealCardAi = (index: number) => {
      setCards(prev => {
          const newCards = [...prev];
          newCards[index].isFlipped = true;
          return newCards;
      });
      setFlippedIndices(prev => {
         const newIndices = [...prev, index];
         return newIndices;
      });
      setAiMemory(prev => {
          const newMem = new Map(prev);
          newMem.set(cards[index].id, index);
          return newMem;
      });
  };

  useEffect(() => {
    if (flippedIndices.length === 2 && !isProcessing) {
        // Fallback catch if processing didn't trigger
        setIsProcessing(true);
        checkMatch(flippedIndices, cards);
    }
  }, [flippedIndices]);

  useEffect(() => {
      if (gameState.status === GameStatus.PLAYING && 
          gameState.mode === GameMode.VS_AI && 
          players[gameState.currentPlayerIndex].isAi && 
          !isProcessing && 
          flippedIndices.length === 0) {
          aiTurn();
      }
  }, [gameState.currentPlayerIndex, gameState.status, isProcessing, flippedIndices.length]);

  const currentPlayer = players[gameState.currentPlayerIndex];
  const isMyTurn = gameState.mode === GameMode.ONLINE_PVP ? currentPlayer.isLocal : true;

  if (gameState.status === GameStatus.LOBBY) {
    return <Lobby onStart={resetGame} />;
  }

  if (gameState.status === GameStatus.GENERATING) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="animate-spin text-6xl mb-6">🔮</div>
        <h2 className="text-3xl font-bold text-center animate-pulse">{loadingMessage}</h2>
      </div>
    );
  }

  if (gameState.status === GameStatus.WAITING_FOR_PLAYER) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-neo-bg">
        <div className="bg-white border-4 border-black p-8 rounded-2xl shadow-neo-lg text-center max-w-md w-full">
            <h2 className="text-3xl font-black mb-4">ROOM: <span className="text-neo-primary tracking-widest">{gameState.roomId}</span></h2>
            <div className="flex justify-center mb-6">
                <div className="w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
            </div>
            <p className="font-bold text-xl mb-6">Waiting for opponent...</p>
            <p className="text-sm text-gray-500 mb-8">Region: {gameState.region}</p>
            
            <div className="p-4 bg-gray-100 border-2 border-black rounded mb-4">
                <p className="text-xs uppercase font-bold mb-2">How to join</p>
                <p className="text-sm">Open this site in another tab/window and enter code <span className="font-mono bg-black text-white px-1">{gameState.roomId}</span></p>
            </div>

            <Button variant="outline" onClick={() => setGameState(prev => ({ ...prev, status: GameStatus.LOBBY }))}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col max-w-6xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <Button variant="outline" size="sm" onClick={() => {
            multiplayer.close();
            setGameState(prev => ({ ...prev, status: GameStatus.LOBBY }));
        }}>
          <ArrowLeft size={20} /> Quit
        </Button>

        <div className="bg-white border-4 border-black px-6 py-3 rounded-xl shadow-neo flex flex-col md:flex-row items-center gap-4">
           {players.map((p, idx) => (
             <div key={p.id} className={`flex items-center gap-2 ${gameState.currentPlayerIndex === idx ? 'opacity-100 scale-110 font-black' : 'opacity-50'} transition-all`}>
                <div className={`w-4 h-4 rounded-full border-2 border-black ${p.color}`}></div>
                <span className="text-xl">{p.name} {p.isLocal ? '(You)' : ''}: {p.score}</span>
             </div>
           ))}
        </div>
        
        {gameState.mode === GameMode.ONLINE_PVP && (
            <div className="bg-black text-white px-3 py-1 rounded font-mono text-xs flex items-center gap-2">
                <Users size={14} /> Room: {gameState.roomId}
            </div>
        )}
      </div>
      
      {gameState.mode === GameMode.ONLINE_PVP && (
          <div className="text-center mb-4">
              {isMyTurn ? (
                  <span className="bg-neo-primary text-white px-4 py-2 rounded-full font-bold text-lg animate-bounce inline-block">YOUR TURN</span>
              ) : (
                  <span className="bg-gray-300 text-gray-600 px-4 py-2 rounded-full font-bold text-sm inline-block">Waiting for opponent...</span>
              )}
          </div>
      )}

      {/* GAME BOARD */}
      <div className={`flex-1 flex items-center justify-center mb-8 transition-opacity ${(!isMyTurn && gameState.mode === GameMode.ONLINE_PVP) ? 'opacity-80 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-4 gap-3 md:gap-4 w-full max-w-3xl">
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
                  <span className={`px-2 py-1 ${gameState.winner?.color} border-2 border-black text-white rounded mr-2`}>
                    {gameState.winner?.name}
                  </span>
                  Wins!
                </p>
             )}

             <div className="flex flex-col gap-3">
                {gameState.mode !== GameMode.ONLINE_PVP && (
                    <Button fullWidth onClick={() => resetGame(gameState.mode, gameState.deckTheme)}>Play Again</Button>
                )}
                <Button fullWidth variant="outline" onClick={() => setGameState(prev => ({ ...prev, status: GameStatus.LOBBY }))}>Back to Lobby</Button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
