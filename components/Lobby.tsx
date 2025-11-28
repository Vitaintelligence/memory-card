
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { GameMode } from '../types';
import { Gamepad2, Users, Bot, Wand2, Globe, Wifi } from 'lucide-react';
import { multiplayer } from '../services/multiplayerService';

interface LobbyProps {
  onStart: (mode: GameMode, theme: string, roomConfig?: { roomId: string; isHost: boolean }) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onStart }) => {
  const [theme, setTheme] = useState('Fruits');
  const [customTheme, setCustomTheme] = useState('');
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [region, setRegion] = useState('DETECTING...');
  const [isJoinMode, setIsJoinMode] = useState(false);

  const predefinedThemes = ['Space', 'Animals', '90s Retro', 'Cyberpunk', 'Food'];

  useEffect(() => {
    // Simulate region detection delay for effect
    setTimeout(() => {
      setRegion(multiplayer.getRegion());
    }, 800);
  }, []);

  const handleStart = () => {
    if (selectedMode) {
      const finalTheme = customTheme.trim() || theme;
      
      if (selectedMode === GameMode.ONLINE_PVP) {
        if (isJoinMode) {
          // Joining logic
          if (roomCode.length !== 4) return;
          onStart(selectedMode, finalTheme, { roomId: roomCode.toUpperCase(), isHost: false });
        } else {
          // Creating logic
          const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
          onStart(selectedMode, finalTheme, { roomId: newRoomId, isHost: true });
        }
      } else {
        onStart(selectedMode, finalTheme);
      }
    }
  };

  const ModeCard = ({ mode, icon: Icon, title, sub, colorClass, activeClass }: any) => (
    <button 
      onClick={() => setSelectedMode(mode)}
      className={`flex flex-col items-center justify-center p-6 border-4 border-black rounded-xl transition-all h-full ${selectedMode === mode ? `${activeClass} translate-x-[4px] translate-y-[4px] shadow-none` : 'bg-white hover:bg-gray-50 shadow-neo hover:shadow-neo-hover'}`}
    >
      <Icon size={40} className="mb-2" />
      <span className="font-bold">{title}</span>
      <span className="text-xs mt-1 opacity-80 uppercase tracking-wider">{sub}</span>
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 flex flex-col items-center justify-center min-h-[85vh]">
      <div className="bg-white border-4 border-black shadow-neo-lg rounded-2xl p-6 md:p-8 w-full max-w-2xl relative">
        <div className="absolute -top-6 -left-2 md:-left-6 bg-neo-secondary border-4 border-black px-6 py-2 shadow-neo rotate-[-3deg] z-10">
           <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">NeoMatch</h1>
        </div>
        
        <div className="mt-8 mb-6 border-b-4 border-black pb-4 flex justify-between items-end">
          <h2 className="text-2xl font-bold">Select Game Mode</h2>
          {selectedMode === GameMode.ONLINE_PVP && (
            <div className="flex items-center gap-2 text-xs font-mono bg-black text-white px-2 py-1 rounded">
               <Wifi size={12} className="animate-pulse text-green-400" />
               {region}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <ModeCard 
            mode={GameMode.SOLO} 
            icon={Gamepad2} 
            title="Solo" 
            sub="Time Attack" 
            activeClass="bg-neo-primary text-white" 
          />
          <ModeCard 
            mode={GameMode.LOCAL_PVP} 
            icon={Users} 
            title="Local" 
            sub="1v1" 
            activeClass="bg-neo-accent text-white" 
          />
          <ModeCard 
            mode={GameMode.VS_AI} 
            icon={Bot} 
            title="Vs AI" 
            sub="Gemini" 
            activeClass="bg-neo-secondary text-black" 
          />
          <ModeCard 
            mode={GameMode.ONLINE_PVP} 
            icon={Globe} 
            title="Online" 
            sub="Multiplayer" 
            activeClass="bg-black text-white" 
          />
        </div>

        {/* Dynamic Section Based on Mode */}
        {selectedMode === GameMode.ONLINE_PVP ? (
          <div className="bg-gray-100 border-4 border-black p-4 rounded-xl mb-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex gap-2 mb-4">
               <Button 
                 fullWidth 
                 size="sm" 
                 variant={!isJoinMode ? 'primary' : 'outline'} 
                 onClick={() => setIsJoinMode(false)}
               >
                 Create Room
               </Button>
               <Button 
                 fullWidth 
                 size="sm" 
                 variant={isJoinMode ? 'primary' : 'outline'} 
                 onClick={() => setIsJoinMode(true)}
               >
                 Join Room
               </Button>
            </div>

            {isJoinMode ? (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold uppercase">Enter 4-Character Room Code:</label>
                <input 
                  type="text" 
                  maxLength={4}
                  placeholder="CODE"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full text-center text-4xl font-mono border-4 border-black p-2 rounded-lg outline-none focus:ring-4 focus:ring-neo-primary/50 tracking-[1em]"
                />
                <p className="text-xs text-gray-500 mt-1">Ask your friend for their code.</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="font-bold">You will be the Host.</p>
                <p className="text-sm text-gray-600">You'll generate the deck and share the room code.</p>
              </div>
            )}
          </div>
        ) : null}

        <h2 className="text-2xl font-bold mb-4 border-b-4 border-black pb-4 flex items-center gap-2">
          <Wand2 className="inline" /> Theme Selection
        </h2>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {predefinedThemes.map(t => (
            <button
              key={t}
              onClick={() => { setTheme(t); setCustomTheme(''); }}
              className={`px-4 py-2 border-2 border-black rounded-lg font-bold text-sm transition-all ${theme === t && !customTheme ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-8">
           <input 
             type="text" 
             placeholder="Or type anything (e.g., 'Pokemon')"
             value={customTheme}
             onChange={(e) => setCustomTheme(e.target.value)}
             className="flex-1 border-4 border-black p-3 rounded-lg font-bold outline-none focus:ring-4 focus:ring-neo-primary/50"
           />
        </div>

        <Button 
          disabled={!selectedMode || (selectedMode === GameMode.ONLINE_PVP && isJoinMode && roomCode.length < 4)} 
          onClick={handleStart} 
          fullWidth 
          size="lg" 
          variant={selectedMode === GameMode.ONLINE_PVP ? 'primary' : 'secondary'}
          className={selectedMode === GameMode.ONLINE_PVP ? 'bg-black text-white' : ''}
        >
          {selectedMode === GameMode.ONLINE_PVP ? (isJoinMode ? 'JOIN MATCH' : 'CREATE MATCH') : 'START GAME'}
        </Button>
      </div>
    </div>
  );
};
