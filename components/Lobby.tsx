
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { GameMode } from '../types';
import { Gamepad2, Users, Bot, Wand2, Globe, Wifi, Search, Signal, Radio, Eye, Loader2 } from 'lucide-react';
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
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  
  // Discovery State
  const [activeRooms, setActiveRooms] = useState<DiscoveredRoom[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const predefinedThemes = ['Space', 'Animals', '90s Retro', 'Cyberpunk', 'Food'];

  useEffect(() => {
    setRegion(multiplayer.getRegion());
  }, []);

  useEffect(() => {
    if (userName) localStorage.setItem('neo_username', userName);
  }, [userName]);

  // Handle Discovery Mode (Local)
  useEffect(() => {
    if (selectedMode === GameMode.ONLINE_PVP && isJoinMode) {
        setIsScanning(true);
        setActiveRooms([]); 
        
        multiplayer.startDiscovery(
            (room) => {
                setActiveRooms(prev => {
                    const index = prev.findIndex(r => r.id === room.id);
                    if (index !== -1) {
                         const newRooms = [...prev];
                         newRooms[index] = room;
                         return newRooms;
                    }
                    return [...prev, room];
                });
            },
            (count) => {}
        );
    } else {
        setIsScanning(false);
    }
  }, [selectedMode, isJoinMode]);

  const handleStart = async () => {
    if (selectedMode && userName.trim()) {
      const finalTheme = customTheme.trim() || theme;
      
      if (selectedMode === GameMode.ONLINE_PVP) {
        if (isJoinMode) {
          if (roomCode.length !== 4) return;
          onStart(selectedMode, finalTheme, userName, { roomId: roomCode.toUpperCase(), isHost: false });
        } else {
          // CREATE ROOM LOGIC
          setIsCreatingRoom(true);
          let attempts = 0;
          let created = false;
          let newRoomId = '';

          // Try to generate a unique 4-char code
          while (!created && attempts < 5) {
              newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
              try {
                  created = await multiplayer.createRoom(newRoomId);
              } catch (e) {
                  console.log("ID collision, retrying...", newRoomId);
              }
              attempts++;
          }

          setIsCreatingRoom(false);
          if (created) {
              onStart(selectedMode, finalTheme, userName, { roomId: newRoomId, isHost: true, maxPlayers: maxPlayers });
          } else {
              alert("Failed to connect to Global Network. Please try again.");
          }
        }
      } else {
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
          onStart(GameMode.ONLINE_PVP, room.theme, userName, { roomId: room.id, isHost: false, isSpectator: true });
      } else {
          if (room.currentPlayers >= room.maxPlayers) {
             alert("Room is full!");
             return;
          }
          onStart(GameMode.ONLINE_PVP, room.theme, userName, { roomId: room.id, isHost: false });
      }
  };

  const ModeCard = ({ mode, icon: Icon, title, sub, activeClass }: any) => (
    <button 
      onClick={() => {
          setSelectedMode(mode);
          if (mode === GameMode.ONLINE_PVP) setIsJoinMode(false); 
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
                     P2P NETWORK READY
                 </div>
             )}
          </div>
        </div>

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
          <ModeCard mode={GameMode.SOLO} icon={Gamepad2} title="Solo" sub="Time Attack" activeClass="bg-neo-primary text-white" />
          <ModeCard mode={GameMode.LOCAL_PVP} icon={Users} title="Local" sub="1v1" activeClass="bg-neo-accent text-white" />
          <ModeCard mode={GameMode.VS_AI} icon={Bot} title="Vs AI" sub="Gemini" activeClass="bg-neo-secondary text-black" />
          <ModeCard mode={GameMode.ONLINE_PVP} icon={Wifi} title="Online" sub="Internet" activeClass="bg-black text-white" />
        </div>

        {selectedMode === GameMode.ONLINE_PVP ? (
          <div className="bg-gray-100 border-4 border-black p-4 rounded-xl mb-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex gap-2 mb-4">
               <Button fullWidth size="sm" variant={!isJoinMode ? 'primary' : 'outline'} onClick={() => setIsJoinMode(false)}>Host Game</Button>
               <Button fullWidth size="sm" variant={isJoinMode ? 'primary' : 'outline'} onClick={() => setIsJoinMode(true)}>Join Game</Button>
            </div>

            {!isJoinMode && (
                <div className="mb-4 bg-white border-2 border-black p-3 rounded-lg">
                    <label className="block text-xs font-bold uppercase mb-2 flex justify-between">
                        <span>Max Players</span>
                        <span className="bg-neo-primary text-white px-2 rounded">{maxPlayers}</span>
                    </label>
                    <input type="range" min="2" max="10" value={maxPlayers} onChange={(e) => setMaxPlayers(parseInt(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer border-2 border-black" />
                </div>
            )}

            {isJoinMode ? (
              <div className="flex flex-col gap-4">
                 <div className="flex gap-2">
                    <input 
                    type="text" 
                    maxLength={4}
                    placeholder="ENTER ROOM CODE"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="flex-1 text-center font-mono border-4 border-black p-2 rounded-lg outline-none focus:ring-4 focus:ring-neo-primary/50 tracking-[0.2em] uppercase font-bold text-xl"
                    />
                    <Button disabled={roomCode.length < 4} onClick={handleStart} size="sm">JOIN</Button>
                </div>
                
                <div className="text-center text-xs text-gray-500 font-bold mt-2 mb-1">- OR SCAN LOCAL NETWORK -</div>

                <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar bg-white border-2 border-black p-2 rounded">
                    {activeRooms.length === 0 ? (
                        <div className="text-center py-4 opacity-50">
                            <Radio className="mx-auto mb-2 animate-pulse" />
                            <p className="text-xs">Scanning local WiFi...</p>
                        </div>
                    ) : (
                        activeRooms.map(room => (
                            <div key={room.id} className="flex justify-between items-center bg-gray-50 border border-black p-2 rounded hover:bg-gray-100 cursor-pointer" onClick={() => joinDetectedRoom(room)}>
                                <div><span className="font-bold">{room.hostName}</span> <span className="text-xs bg-black text-white px-1">{room.theme}</span></div>
                                <span className="font-mono text-xs font-bold">#{room.id}</span>
                            </div>
                        ))
                    )}
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                 <p className="text-sm text-gray-600 mb-4">Create a room to play with anyone over the internet. You will receive a code to share.</p>
              </div>
            )}
          </div>
        ) : null}

        {(!selectedMode || selectedMode !== GameMode.ONLINE_PVP || !isJoinMode) && (
            <>
                {(!selectedMode || selectedMode !== GameMode.ONLINE_PVP) && (
                <>
                <h2 className="text-2xl font-bold mb-4 border-b-4 border-black pb-4 flex items-center gap-2">
                <Wand2 className="inline" /> Theme
                </h2>
                
                <div className="flex flex-wrap gap-2 mb-4">
                {predefinedThemes.map(t => (
                    <button key={t} onClick={() => { setTheme(t); setCustomTheme(''); }} className={`px-4 py-2 border-2 border-black rounded-lg font-bold text-sm transition-all ${theme === t && !customTheme ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>
                    {t}
                    </button>
                ))}
                </div>

                <div className="flex gap-2 mb-8">
                <input type="text" placeholder="Or type anything..." value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} className="flex-1 border-4 border-black p-3 rounded-lg font-bold outline-none focus:ring-4 focus:ring-neo-primary/50" />
                </div>
                </>
                )}

                <Button 
                disabled={!selectedMode || !userName.trim() || isCreatingRoom} 
                onClick={handleStart} 
                fullWidth 
                size="lg" 
                variant={selectedMode === GameMode.ONLINE_PVP ? 'primary' : 'secondary'}
                className={selectedMode === GameMode.ONLINE_PVP ? 'bg-black text-white' : ''}
                >
                {isCreatingRoom ? <><Loader2 className="animate-spin mr-2"/> ESTABLISHING LINK...</> : selectedMode === GameMode.ONLINE_PVP ? 'CREATE SECURE ROOM' : 'START GAME'}
                </Button>
            </>
        )}
      </div>
    </div>
  );
};
