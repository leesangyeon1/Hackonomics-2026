import { useMemo, useState } from 'react'
import './GradientText.css'

function GradientText({
  children,
  className = '',
  colors = ['#5227FF', '#FF9FFC', '#B19EEF'],
  animationSpeed = 8,
  showBorder = false,
  direction = 'horizontal',
  pauseOnHover = false,
  yoyo = true,
}) {
  const [isPaused, setIsPaused] = useState(false)

  const gradientAngle =
    direction === 'horizontal' ? 'to right' : direction === 'vertical' ? 'to bottom' : 'to bottom right'
  const gradientColors = [...colors, colors[0]].join(', ')
  const gradientStyle = useMemo(() => ({
    backgroundImage: `linear-gradient(${gradientAngle}, ${gradientColors})`,
    backgroundSize: direction === 'horizontal' ? '300% 100%' : direction === 'vertical' ? '100% 300%' : '300% 300%',
    backgroundRepeat: 'repeat',
    animationDuration: `${Math.max(0.5, animationSpeed)}s`,
    animationDirection: yoyo ? 'alternate' : 'normal',
    animationPlayState: isPaused ? 'paused' : 'running',
  }), [animationSpeed, direction, gradientAngle, gradientColors, isPaused, yoyo])

  return (
    <div
      className={`animated-gradient-text ${showBorder ? 'with-border' : ''} ${className}`}
      onMouseEnter={() => {
        if (pauseOnHover) setIsPaused(true)
      }}
      onMouseLeave={() => {
        if (pauseOnHover) setIsPaused(false)
      }}
      style={gradientStyle}
    >
      {showBorder && <div className="gradient-overlay" style={gradientStyle} />}
      <div className="text-content" style={gradientStyle}>
        {children}
      </div>
    </div>
  )
}

export default GradientText
