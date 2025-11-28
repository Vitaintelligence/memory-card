import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  
  const baseStyles = "font-bold border-2 border-black transition-all duration-150 ease-in-out flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-neo-primary text-white shadow-neo hover:shadow-neo-hover hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none active:translate-x-[5px] active:translate-y-[5px]",
    secondary: "bg-neo-secondary text-black shadow-neo hover:shadow-neo-hover hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none active:translate-x-[5px] active:translate-y-[5px]",
    accent: "bg-neo-accent text-white shadow-neo hover:shadow-neo-hover hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none active:translate-x-[5px] active:translate-y-[5px]",
    outline: "bg-white text-black shadow-neo hover:bg-gray-50 hover:shadow-neo-hover hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none active:translate-x-[5px] active:translate-y-[5px]",
  };

  const sizes = {
    sm: "px-3 py-1 text-sm rounded-md",
    md: "px-6 py-3 text-lg rounded-lg",
    lg: "px-8 py-4 text-xl rounded-xl",
  };

  const width = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${width} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      {children}
    </button>
  );
};
