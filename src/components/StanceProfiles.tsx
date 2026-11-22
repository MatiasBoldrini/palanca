import type { Vec2 } from '../model/geometry'
import type { Frame } from '../model/lift'
import './StanceProfiles.css'

interface Props {
  frame: Frame
  reference: Frame
  heightM: number
  currentLabel: string
  referenceLabel: string
}

const FLOOR = 88
const WIDTH = 126
const centimetres = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export function StanceProfiles({ frame, reference, heightM, currentLabel, referenceLabel }: Props) {
  const profiles = [
    { frame, label: currentLabel },
    { frame: reference, label: referenceLabel },
  ]
  // The model sets x = 0 at midfoot and y = 0 at the floor. Both projections
  // keep those origins and use standing height as the fixed reference for scale.
  const scale = (FLOOR - 5) / heightM
  const x = (p: Vec2) => WIDTH / 2 + p.x * scale
  const y = (p: Vec2) => FLOOR - p.y * scale
  const line = (...joints: Vec2[]) => joints.map((p) => `${x(p)},${y(p)}`).join(' ')

  return (
    <div className="stance-profiles" role="group" aria-label="Comparación de perfil a igual escala">
      {profiles.map(({ frame: sample, label }, index) => {
        const p = sample.posture
        const distance = centimetres.format(Math.abs(sample.kinetics.barMomentArm.hip) * 100)
        return (
          <figure key={index} className="stance-profile">
            <figcaption>{label}</figcaption>
            {sample.feasible ? (
              <>
                <svg viewBox={`0 0 ${WIDTH} 91`} role="img" aria-label={`${label} de perfil. La distancia horizontal entre la cadera y la vertical de la barra es ${distance} centímetros.`}>
                  <line className="sp-ground" x1="2" x2={WIDTH - 2} y1={FLOOR} y2={FLOOR} />
                  <line className="sp-vertical" x1={x(p.bar)} x2={x(p.bar)} y1="2" y2={FLOOR} />
                  <g className="sp-body">
                    <polyline points={line(p.heel, p.ankle, p.toe, p.heel)} className="sp-foot" />
                    <polyline points={line(p.ankle, p.knee, p.hip)} />
                    <polyline points={line(p.hip, p.lumbosacral, p.lumbarApex, p.thoracolumbar, p.thoracicApex, p.shoulder)} className="sp-trunk" />
                    <polyline points={line(p.shoulder, p.headCom)} />
                    <circle className="sp-head" cx={x(p.headCom)} cy={y(p.headCom)} r={Math.hypot(p.headTop.x - p.headCom.x, p.headTop.y - p.headCom.y) * scale} />
                    <polyline points={line(p.shoulder, p.elbow, p.hand)} className="sp-arm" />
                    <circle className="sp-knee" cx={x(p.knee)} cy={y(p.knee)} r="1.6" />
                  </g>
                  <g className="sp-distance">
                    <line x1={x(p.hip)} y1={y(p.hip)} x2={x(p.bar)} y2={y(p.hip)} />
                    <line x1={x(p.bar)} y1={y(p.hip) - 2.7} x2={x(p.bar)} y2={y(p.hip) + 2.7} />
                    <circle cx={x(p.hip)} cy={y(p.hip)} r="2.5" />
                  </g>
                  <circle className="sp-bar" cx={x(p.bar)} cy={y(p.bar)} r="3.2" />
                </svg>
                <span className="sp-reading" aria-hidden="true">Cadera–barra <b>{distance} cm</b></span>
              </>
            ) : <span className="sp-unavailable">Sin postura en equilibrio</span>}
          </figure>
        )
      })}
    </div>
  )
}
