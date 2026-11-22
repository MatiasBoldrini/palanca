import { Check, Ellipsis, Pause, Play } from 'lucide-react'
import type { CSSProperties } from 'react'
import { clamp, lerp } from '../model/geometry'
import type { PlaybackPhase } from '../hooks/useAnimationEngine'
import { ControlDisclosure } from './ControlDisclosure'
import './minimalControls.css'

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
  const stops = [lowerStop, 'Mitad', 'Bloqueo']
  const selectedStop = stops.findIndex((_, index) => Math.abs(fraction - index / 2) < 0.012)
  const position = playing
    ? phase === 'descending'
      ? 'Bajada'
      : 'Subida'
    : (stops[selectedStop] ?? 'Recorrido')
  return (
    <div className="movement-player">
      <button
        className="movement-play"
        type="button"
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
      <div className="movement-rail">
        <div className="movement-position">
          <span>{position}</span>
          <span>
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
      <ControlDisclosure
        className="playback-options"
        label="Opciones de reproducción"
        trigger={<Ellipsis size={19} aria-hidden />}
      >
        {(close) => (
          <>
            <div className="playback-stops" role="group" aria-label="Ir a una posición">
              {stops.map((stop, index) => (
                <button
                  key={stop}
                  type="button"
                  disabled={range.max <= range.min}
                  aria-pressed={!playing && selectedStop === index}
                  onClick={() => {
                    onScrub(lerp(range.min, range.max, index / 2))
                    close()
                  }}
                >
                  {stop}
                  {!playing && selectedStop === index && <Check size={15} aria-hidden />}
                </button>
              ))}
            </div>
            <button className="playback-rate" type="button" aria-pressed={slow} onClick={onSpeed}>
              Cámara lenta <span>{slow ? '0,5×' : '1×'}</span>
            </button>
          </>
        )}
      </ControlDisclosure>
    </div>
  )
}
