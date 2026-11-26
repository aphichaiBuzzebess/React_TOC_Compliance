import { cn } from '@/lib/utils'

/** The product's name, as in the TOR Check mockup. Internal ids (the storage key, the request header) keep "tor-scouter". */
export const APP_NAME = 'TOR Check'

/**
 * The mark from the mockup: a rounded square with a yellow dot in its top-right corner. The square takes the text colour, so it
 * is black on the light theme and light on the dark one; the corner is a third of the size, the dot a third, inset a sixth.
 */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('relative inline-block flex-none bg-ink', className)} style={{ width: size, height: size, borderRadius: size / 3 }}>
      <span className="absolute rounded-full bg-bee" style={{ width: size / 3, height: size / 3, right: size / 6, top: size / 6 }} />
    </span>
  )
}
