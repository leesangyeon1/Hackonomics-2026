import { useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'

function parseRootMargin(rootMargin) {
  if (typeof rootMargin !== 'string') return '0px'
  return rootMargin
}

function SplitText({
  text,
  className = '',
  delay = 50,
  duration = 1.25,
  ease = 'power3.out',
  splitType = 'chars',
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = '-100px',
  textAlign = 'center',
  tag = 'p',
  onLetterAnimationComplete,
}) {
  const ref = useRef(null)
  const hasAnimatedRef = useRef(false)
  const onCompleteRef = useRef(onLetterAnimationComplete)
  const Tag = tag || 'p'

  const parts = useMemo(() => {
    if (!text) return []
    if (splitType.includes('words')) {
      return text.split(' ').map((word, index, arr) => (index === arr.length - 1 ? word : `${word} `))
    }
    return Array.from(text)
  }, [splitType, text])

  useEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete
  }, [onLetterAnimationComplete])

  useEffect(() => {
    if (!ref.current || hasAnimatedRef.current) return undefined
    const chars = ref.current.querySelectorAll('.split-char')
    if (!chars.length) return undefined

    const animate = () => {
      if (hasAnimatedRef.current) return
      hasAnimatedRef.current = true
      gsap.fromTo(
        chars,
        { ...from },
        {
          ...to,
          duration,
          ease,
          stagger: delay / 1000,
          onComplete: () => onCompleteRef.current?.(),
        },
      )
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          animate()
          observer.disconnect()
        }
      },
      { threshold, rootMargin: parseRootMargin(rootMargin) },
    )

    observer.observe(ref.current)
    const fallbackTimer = window.setTimeout(animate, 250)

    return () => {
      window.clearTimeout(fallbackTimer)
      observer.disconnect()
    }
  }, [delay, duration, ease, from, to, threshold, rootMargin, text, splitType])

  return (
    <Tag ref={ref} className={`split-parent ${className}`} style={{ textAlign }} aria-label={text}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="split-char" aria-hidden="true">
          {part === ' ' ? '\u00A0' : part}
        </span>
      ))}
    </Tag>
  )
}

export default SplitText
