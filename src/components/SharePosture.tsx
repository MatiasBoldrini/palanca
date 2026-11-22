import { Share2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useShareLink } from '../state/appState'
import './sharePosture.css'

type Feedback = {
  state: 'idle' | 'pending' | 'manual' | 'copied' | 'shared'
  url?: string
}

export function SharePosture() {
  const { url, share } = useShareLink()
  const [feedback, setFeedback] = useState<Feedback>({ state: 'idle' })
  const input = useRef<HTMLInputElement>(null)
  const hint = useId()

  useEffect(() => {
    if (feedback.state === 'manual') input.current?.focus()
  }, [feedback])

  const handleShare = async () => {
    setFeedback({ state: 'pending' })
    const result = await share()
    setFeedback({ state: result === 'cancelled' ? 'idle' : result, url })
  }

  return (
    <div className="share-posture">
      <button type="button" className="icon-button" disabled={feedback.state === 'pending'} onClick={handleShare}>
        <Share2 size={15} aria-hidden /> Compartir postura
      </button>
      <span role="status">
        {feedback.url === url && feedback.state === 'copied' && 'Enlace copiado.'}
        {feedback.url === url && feedback.state === 'shared' && 'Postura compartida.'}
      </span>
      {feedback.state === 'manual' && (
        <div className="share-manual">
          <label>
            Enlace de la postura
            <input
              ref={input}
              type="text"
              readOnly
              value={url}
              spellCheck={false}
              aria-describedby={hint}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <p id={hint}>Usá la opción Copiar del dispositivo o el atajo del teclado.</p>
        </div>
      )}
    </div>
  )
}
