import { useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'
import './MagicBento.css'
import ShinyText from './ShinyText.jsx'

const DEFAULT_PARTICLE_COUNT = 12
const DEFAULT_SPOTLIGHT_RADIUS = 300
const DEFAULT_GLOW_COLOR = '87, 166, 240'

const fallbackCards = [
  {
    title: 'Overview',
    metrics: [
      { label: 'Analytics', value: 'Track user behavior' },
      { label: 'Dashboard', value: 'Centralized data view' },
    ],
    accent: '#57a6ff',
  },
]

function MagicBentoCard({
  item,
  textAutoHide,
  enableBorderGlow,
  disableAnimations,
  particleCount,
  glowColor,
  enableTilt,
  enableMagnetism,
  clickEffect,
}) {
  const ref = useRef(null)
  const particlesRef = useRef([])
  const emitRipple = (clientX, clientY) => {
    const el = ref.current
    if (!el || !clickEffect || disableAnimations) return
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const ripple = document.createElement('div')
    ripple.className = 'magic-ripple'
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`
    ripple.style.setProperty('--ripple-color', glowColor)
    el.appendChild(ripple)
    gsap.fromTo(ripple, { scale: 0, opacity: 0.8 }, { scale: 8, opacity: 0, duration: 0.8, onComplete: () => ripple.remove() })
  }

  useEffect(() => {
    if (!ref.current || disableAnimations) return undefined
    const el = ref.current

    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      el.style.setProperty('--glow-x', `${(x / rect.width) * 100}%`)
      el.style.setProperty('--glow-y', `${(y / rect.height) * 100}%`)
      el.style.setProperty('--glow-intensity', '1')

      if (enableTilt) {
        const rotateX = ((y - rect.height / 2) / rect.height) * -10
        const rotateY = ((x - rect.width / 2) / rect.width) * 10
        gsap.to(el, { rotateX, rotateY, duration: 0.12, ease: 'power2.out', transformPerspective: 1000 })
      }

      if (enableMagnetism) {
        const mx = (x - rect.width / 2) * 0.03
        const my = (y - rect.height / 2) * 0.03
        gsap.to(el, { x: mx, y: my, duration: 0.2, ease: 'power2.out' })
      }
    }

    const onLeave = () => {
      el.style.setProperty('--glow-intensity', '0')
      gsap.to(el, { rotateX: 0, rotateY: 0, x: 0, y: 0, duration: 0.22, ease: 'power2.out' })
      particlesRef.current.forEach((node) => node.remove())
      particlesRef.current = []
    }

    const onEnter = () => {
      for (let i = 0; i < particleCount; i += 1) {
        const p = document.createElement('div')
        p.className = 'particle'
        p.style.left = `${Math.random() * 100}%`
        p.style.top = `${Math.random() * 100}%`
        p.style.background = `rgba(${glowColor}, 1)`
        el.appendChild(p)
        particlesRef.current.push(p)
        gsap.fromTo(
          p,
          { opacity: 0, scale: 0.3 },
          {
            opacity: 0.6,
            scale: 1,
            y: (Math.random() - 0.5) * 48,
            x: (Math.random() - 0.5) * 48,
            duration: 0.5 + Math.random() * 0.7,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          },
        )
      }
    }

    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      particlesRef.current.forEach((node) => node.remove())
      particlesRef.current = []
    }
  }, [disableAnimations, enableMagnetism, enableTilt, glowColor, particleCount])

  const cardClass = [
    'magic-bento-card',
    textAutoHide ? 'magic-bento-card--text-autohide' : '',
    enableBorderGlow ? 'magic-bento-card--border-glow' : '',
  ]
    .join(' ')
    .trim()

  return (
    <div
      ref={ref}
      className={cardClass}
      style={{ '--glow-color': glowColor, '--accent': item.accent || '#8400ff' }}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        emitRipple(e.clientX, e.clientY)
        item.onClick?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          item.onClick?.()
        }
      }}
    >
      <div className="magic-bento-card__content">
        <h2 className="magic-bento-card__title">
          <ShinyText
            text={item.title}
            speed={2}
            delay={0}
            color="#b5b5b5"
            shineColor="#ffffff"
            spread={120}
            direction="left"
            yoyo={false}
            pauseOnHover={false}
            disabled={false}
          />
        </h2>
        {(item.metrics || []).map((metric) => (
          <div key={metric.label} className="magic-metric-row">
            <h3 className="magic-metric-line">
              <ShinyText
                text={`${metric.label}: ${metric.value}`}
                speed={2}
                delay={0}
                color="#b5b5b5"
                shineColor="#ffffff"
                spread={120}
                direction="left"
                yoyo={false}
                pauseOnHover={false}
                disabled={false}
              />
            </h3>
          </div>
        ))}
      </div>
    </div>
  )
}

function GlobalSpotlight({ enabled, gridRef, spotlightRadius, glowColor, disableAnimations }) {
  useEffect(() => {
    if (!enabled || disableAnimations || !gridRef.current) return undefined
    const spotlight = document.createElement('div')
    spotlight.className = 'global-spotlight'
    spotlight.style.setProperty('--spotlight-color', glowColor)
    spotlight.style.setProperty('--spotlight-radius', `${spotlightRadius}px`)
    document.body.appendChild(spotlight)

    const onMove = (e) => {
      const sectionRect = gridRef.current.getBoundingClientRect()
      const inside =
        e.clientX >= sectionRect.left &&
        e.clientX <= sectionRect.right &&
        e.clientY >= sectionRect.top &&
        e.clientY <= sectionRect.bottom

      if (!inside) {
        gsap.to(spotlight, { opacity: 0, duration: 0.2 })
        return
      }

      gsap.to(spotlight, {
        left: e.clientX,
        top: e.clientY,
        opacity: 0.72,
        duration: 0.14,
        ease: 'power2.out',
      })
    }

    const onLeave = () => gsap.to(spotlight, { opacity: 0, duration: 0.2 })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      spotlight.remove()
    }
  }, [disableAnimations, enabled, glowColor, gridRef, spotlightRadius])

  return null
}

function MagicBento({
  items,
  textAutoHide = true,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  enableTilt = false,
  enableMagnetism = false,
  clickEffect = true,
  spotlightRadius = 400,
  particleCount = DEFAULT_PARTICLE_COUNT,
  glowColor = DEFAULT_GLOW_COLOR,
  disableAnimations = false,
}) {
  const gridRef = useRef(null)
  const shouldDisableAnimations = disableAnimations
  const cardItems = useMemo(() => (Array.isArray(items) && items.length ? items : fallbackCards), [items])

  return (
    <div className="bento-section">
      {enableSpotlight && (
        <GlobalSpotlight
          enabled={enableSpotlight}
          gridRef={gridRef}
          spotlightRadius={spotlightRadius || DEFAULT_SPOTLIGHT_RADIUS}
          glowColor={glowColor}
          disableAnimations={shouldDisableAnimations}
        />
      )}
      <div className="card-grid" ref={gridRef}>
        {cardItems.map((item, index) => (
          <MagicBentoCard
            key={`${index}-${item.metrics?.[0]?.label ?? 'card'}`}
            item={item}
            textAutoHide={textAutoHide}
            enableBorderGlow={enableBorderGlow}
            disableAnimations={!enableStars || shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            enableMagnetism={enableMagnetism}
            clickEffect={clickEffect}
          />
        ))}
      </div>
    </div>
  )
}

export default MagicBento
