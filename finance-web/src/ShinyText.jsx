import { useMemo, useState } from 'react'
import './ShinyText.css'

function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 0,
}) {
  const [isPaused, setIsPaused] = useState(false)
  const gradientStyle = useMemo(
    () => ({
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
      animationDuration: `${Math.max(0.2, speed)}s`,
      animationDelay: `${Math.max(0, delay)}s`,
      animationDirection: direction === 'left' ? 'normal' : 'reverse',
      animationIterationCount: yoyo ? 'infinite' : 'infinite',
      animationTimingFunction: yoyo ? 'ease-in-out' : 'linear',
      animationPlayState: disabled || isPaused ? 'paused' : 'running',
    }),
    [color, delay, direction, disabled, isPaused, shineColor, speed, spread, yoyo],
  )

  return (
    <span
      className={`shiny-text ${className}`}
      style={gradientStyle}
      onMouseEnter={() => {
        if (pauseOnHover) setIsPaused(true)
      }}
      onMouseLeave={() => {
        if (pauseOnHover) setIsPaused(false)
      }}
    >
      {text}
    </span>
  )
}

export default ShinyText
