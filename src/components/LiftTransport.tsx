import { Pause, Play } from 'lucide-react'
import type { CSSProperties } from 'react'
import { clamp, lerp } from '../model/geometry'
import type { PlaybackPhase } from '../hooks/useAnimationEngine'

interface Props {
  marker: string
  height: number
  lowerStop: string
  playing: boolean
  phase: PlaybackPhase
  progress: number
  range: { min: number; max: number }
  slow: boolean
  onSpeed: () => void
  onPlay: () => void
  onScrub: (value: number) => void
}

export function LiftTransport({
  marker,
  height,
  lowerStop,
  playing,
  phase,
  progress,
  range,
  slow,
  onSpeed,
  onPlay,
  onScrub,
}: Props) {
  const fraction = clamp((progress - range.min) / (range.max - range.min || 1), 0, 1)
  const pct = Math.round(fraction * 100)
  const centimetres = Math.round(height * 100)
  return (
    <>
      <div className="lift-transport">
        <button
          className="atlas-play"
          aria-label={playing ? 'Pausar' : 'Reproducir el recorrido'}
          onClick={onPlay}
          disabled={range.max <= range.min}
        >
          {playing ? (
            <Pause size={17} fill="currentColor" aria-hidden />
          ) : (
            <Play size={17} fill="currentColor" aria-hidden />
          )}
        </button>
        <div className="timeline">
          <div className="timeline-head">
            <strong>
              {playing ? (phase === 'descending' ? 'Bajada' : 'Subida') : 'Recorrido'}
            </strong>
            <span className="num">
              {marker} a {centimetres} cm
            </span>
          </div>
          <input
            aria-label="Posición del levantamiento"
            aria-valuetext={`${pct} por ciento del recorrido, ${marker.toLowerCase()} a ${centimetres} centímetros`}
            type="range"
            min={0}
            max={1000}
            disabled={range.max <= range.min}
            value={Math.round(fraction * 1000)}
            onChange={(event) =>
              onScrub(lerp(range.min, range.max, Number(event.target.value) / 1000))
            }
            style={{ '--pct': `${pct}%` } as CSSProperties}
          />
        </div>
        <button
          className="atlas-speed num"
          aria-label="Cámara lenta a media velocidad"
          aria-pressed={slow}
          onClick={onSpeed}
          title="Alternar velocidad normal y media"
        >
          {slow ? '0,5×' : '1×'}
        </button>
      </div>
      <div className="phase-stops" role="group" aria-label="Comparar posiciones">
        {[lowerStop, 'Mitad', 'Bloqueo'].map((label, index) => (
          <button
            key={label}
            aria-pressed={!playing && Math.abs(fraction - index / 2) < 0.012}
            onClick={() => onScrub(lerp(range.min, range.max, index / 2))}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
