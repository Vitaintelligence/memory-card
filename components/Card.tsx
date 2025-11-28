import React from 'react';
import { CardType } from '../types';

interface CardProps {
  card: CardType;
  onClick: (card: CardType) => void;
  disabled: boolean;
}

export const Card: React.FC<CardProps> = ({ card, onClick, disabled }) => {
  const handleClick = () => {
    if (!disabled && !card.isFlipped && !card.isMatched) {
      onClick(card);
    }
  };

  return (
    <div className="relative w-full aspect-[3/4] perspective-1000 cursor-pointer group" onClick={handleClick}>
      <div 
        className={`w-full h-full relative transform-style-3d transition-all duration-500 ease-in-out ${card.isFlipped ? 'rotate-y-180' : ''}`}
      >
        {/* Card Back (Face Down) */}
        <div 
          className="absolute w-full h-full backface-hidden border-4 border-black bg-white rounded-xl shadow-neo group-hover:shadow-neo-hover group-hover:translate-x-[1px] group-hover:translate-y-[1px] transition-all flex items-center justify-center overflow-hidden"
        >
           <div className="w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black to-transparent" style={{ backgroundSize: '20px 20px', backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)' }}></div>
           <div className="absolute inset-0 flex items-center justify-center font-bold text-4xl text-black rotate-45">?</div>
        </div>

        {/* Card Front (Face Up) */}
        <div 
          className="absolute w-full h-full backface-hidden rotate-y-180 border-4 border-black rounded-xl shadow-none flex items-center justify-center text-5xl select-none"
          style={{ backgroundColor: card.color }}
        >
          {card.content}
          {card.isMatched && (
            <div className="absolute top-1 right-1 text-green-600 text-lg">
              ✅
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
