
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { GameMode } from '../types';
import { Gamepad2, Users, Bot, Wand2, Globe, Wifi, Search, Signal, Radio, Eye } from 'lucide-react';
import { multiplayer, DiscoveredRoom } from '../services/multiplayerService';

interface LobbyProps {
  onStart: (mode: GameMode, theme: string, userName: string, roomConfig?: { roomId: string; isHost: boolean; isSpectator?: boolean; maxPlayers?: number }) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onStart }) => {
  const [theme, setTheme] = useState('Fruits');
  const [customTheme, setCustomTheme] = useState('');
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [region, setRegion] = useState('DETECTING...');
  const [userName, setUserName] = useState(() => localStorage.getItem('neo_username') || '');
  const [isJoinMode, setIsJoinMode] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(2);
  
  // Discovery State
  const [activeRooms, setActiveRooms] = useState<DiscoveredRoom[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [isScanning, setIsScanning] = useState(false);

  const predefinedThemes = ['Space', 'Animals', '90s Retro', 'Cyberpunk', 'Food'];

  useEffect(() => {
    // Immediate region set
    setRegion(multiplayer.getRegion());
  }, []);

  // Save Name
  useEffect(() => {
    if (userName) localStorage.setItem('neo_username', userName);
  }, [userName]);

  // Handle Discovery Mode
  useEffect(() => {
    if (selectedMode === GameMode.ONLINE_PVP && isJoinMode) {
        setIsScanning(true);
        setActiveRooms([]); // Clear old list
        
        multiplayer.startDiscovery(
            (room) => {
                setActiveRooms(prev => {
                    // Update if exists or add new
                    const index = prev.findIndex(r => r.id === room.id);
                    if (index !== -1) {
                         // Update existing
                         const newRooms = [...prev];
                         newRooms[index] = room;
                         return newRooms;
                    }
                    return [...prev, room];
                });
            },
            (count) => {
                setOnlineCount(count);
            }
        );
    } else {
        setIsScanning(false);
    }
  }, [selectedMode, isJoinMode]);

  const handleStart = () => {
    if (selectedMode && userName.trim()) {
      const finalTheme = customTheme.trim() || theme;
      
      if (selectedMode === GameMode.ONLINE_PVP) {
        if (isJoinMode) {
          // Manually entered code?
          if (roomCode.length !== 4) return;
          onStart(selectedMode, finalTheme, userName, { roomId: roomCode.toUpperCase(), isHost: false });
        } else {
          // Creating logic
          const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
          onStart(selectedMode, finalTheme, userName, { roomId: newRoomId, isHost: true, maxPlayers: maxPlayers });
        }
      } else {
        // Local modes support custom player count too if we wanted, but sticking to logic.
        // Actually, let's pass maxPlayers for LOCAL_PVP as well if we want local multiplayer > 2 in future.
        // For now, LOCAL is fixed 2, AI fixed 2.
        onStart(selectedMode, finalTheme, userName);
      }
    } else if (!userName.trim()) {
        alert("Please enter a codename first!");
    }
  };

  const joinDetectedRoom = (room: DiscoveredRoom) => {
      if (!userName.trim()) {
          alert("Enter a codename to join!");
          return;
      }
      
      if (room.status === 'PLAYING') {
          // Join as Spectator
          onStart(GameMode.ONLINE_PVP, room.theme, userName, { roomId: room.id, isHost: false, isSpectator: true });
      } else {
          // Join as Player
          if (room.currentPlayers >= room.maxPlayers) {
             alert("Room is full!");
             return;
          }
          onStart(GameMode.ONLINE_PVP, room.theme, userName, { roomId: room.id, isHost: false });
      }
  };

  const ModeCard = ({ mode, icon: Icon, title, sub, colorClass, activeClass }: any) => (
    <button 
      onClick={() => {
          setSelectedMode(mode);
          if (mode === GameMode.ONLINE_PVP) setIsJoinMode(false); // Reset to Create by default
      }}
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
          <h2 className="text-2xl font-bold">Identity & Mode</h2>
          <div className="flex flex-col items-end">
             <div className="flex items-center gap-2 text-xs font-mono bg-black text-white px-2 py-1 rounded mb-1">
                <Globe size={12} className="text-blue-400" />
                REGION: {region}
             </div>
             {selectedMode === GameMode.ONLINE_PVP && (
                 <div className="text-xs font-bold text-green-600 flex items-center gap-1">
                     <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                     {onlineCount} ONLINE
                 </div>
             )}
          </div>
        </div>

        {/* Name Input */}
        <div className="mb-6">
            <label className="block text-xs font-bold uppercase tracking-wide mb-1">Codename</label>
            <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value.slice(0, 12))}
                placeholder="ENTER AGENT NAME"
                className="w-full border-4 border-black p-3 rounded-lg font-bold outline-none focus:ring-4 focus:ring-neo-primary/50 text-xl"
            />
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
            icon={Wifi} 
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
                 Host Game
               </Button>
               <Button 
                 fullWidth 
                 size="sm" 
                 variant={isJoinMode ? 'primary' : 'outline'} 
                 onClick={() => setIsJoinMode(true)}
               >
                 Find Games
               </Button>
            </div>

            {!isJoinMode && (
                <div className="mb-4 bg-white border-2 border-black p-3 rounded-lg">
                    <label className="block text-xs font-bold uppercase mb-2 flex justify-between">
                        <span>Max Players</span>
                        <span className="bg-neo-primary text-white px-2 rounded">{maxPlayers}</span>
                    </label>
                    <input 
                        type="range" 
                        min="2" 
                        max="10" 
                        value={maxPlayers} 
                        onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                        className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer border-2 border-black"
                    />
                    <div className="flex justify-between text-[10px] font-mono mt-1 text-gray-500">
                        <span>2 (DUEL)</span>
                        <span>10 (PARTY)</span>
                    </div>
                </div>
            )}

            {isJoinMode ? (
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center bg-black text-white p-2 rounded px-3">
                    <span className="font-mono text-xs flex items-center gap-2"><Radio size={14} className="animate-pulse text-red-500"/> SCANNING FREQUENCIES...</span>
                    <span className="text-xs font-bold">{activeRooms.length} FOUND</span>
                </div>
                
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {activeRooms.length === 0 ? (
                        <div className="text-center py-6 opacity-50 border-2 border-dashed border-gray-400 rounded-lg">
                            <Search className="mx-auto mb-2" />
                            <p className="text-sm font-bold">No signals detected.</p>
                            <p className="text-xs">Waiting for hosts in {region}...</p>
                        </div>
                    ) : (
                        activeRooms.map(room => (
                            <div key={room.id} className="flex justify-between items-center bg-white border-2 border-black p-2 rounded shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all cursor-pointer group"
                                onClick={() => joinDetectedRoom(room)}
                            >
                                <div>
                                    <div className="font-bold text-sm uppercase group-hover:text-neo-primary">{room.theme}</div>
                                    <div className="text-xs text-gray-500 font-mono">HOST: {room.hostName}</div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="font-mono font-black bg-neo-secondary px-1 text-xs mb-1">#{room.id}</span>
                                    {room.status === 'PLAYING' ? (
                                        <span className="text-[10px] text-yellow-600 font-bold flex items-center gap-1">
                                            <Eye size={10} /> WATCH
                                        </span>
                                    ) : (
                                        <div className="flex flex-col items-end">
                                            <span className={`text-[10px] font-bold flex items-center gap-1 ${room.currentPlayers >= room.maxPlayers ? 'text-red-500' : 'text-green-600'}`}>
                                                <Users size={10} /> {room.currentPlayers}/{room.maxPlayers}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-gray-400"></div>
                    <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">OR ENTER CODE</span>
                    <div className="flex-grow border-t border-gray-400"></div>
                </div>

                <div className="flex gap-2">
                    <input 
                    type="text" 
                    maxLength={4}
                    placeholder="CODE"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="flex-1 text-center font-mono border-4 border-black p-2 rounded-lg outline-none focus:ring-4 focus:ring-neo-primary/50 tracking-[0.2em] uppercase font-bold"
                    />
                    <Button 
                        disabled={roomCode.length < 4} 
                        onClick={handleStart}
                        size="sm"
                    >
                        JOIN
                    </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-neo-primary border-4 border-black rounded-full mx-auto mb-3 flex items-center justify-center">
                    <Signal className="text-white animate-pulse" size={32} />
                </div>
                <p className="font-bold text-lg">Broadcasting Signal</p>
                <p className="text-sm text-gray-600 max-w-xs mx-auto">Your room will be visible to nearby players in the <strong>{region}</strong> sector.</p>
              </div>
            )}
          </div>
        ) : null}

        {(!selectedMode || selectedMode !== GameMode.ONLINE_PVP || !isJoinMode) && (
            <>
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
                disabled={!selectedMode || !userName.trim()} 
                onClick={handleStart} 
                fullWidth 
                size="lg" 
                variant={selectedMode === GameMode.ONLINE_PVP ? 'primary' : 'secondary'}
                className={selectedMode === GameMode.ONLINE_PVP ? 'bg-black text-white' : ''}
                >
                {selectedMode === GameMode.ONLINE_PVP ? 'CREATE BROADCAST' : 'START GAME'}
                </Button>
            </>
        )}
      </div>
    </div>
  );
};
