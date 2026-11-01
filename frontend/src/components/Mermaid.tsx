import mermaid from 'mermaid'
import { useEffect, useId, useState } from 'react'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'antiscript',
  theme: 'base',
  fontFamily: 'Inter, sans-serif',
  themeVariables: {
    darkMode: true,
    background: 'transparent',
    primaryColor: '#141b31',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#3b4a75',
    lineColor: '#64748b',
    secondaryColor: '#0f1528',
    tertiaryColor: '#0b1020',
    clusterBkg: 'rgba(255,255,255,0.02)',
    clusterBorder: '#2a3554',
    edgeLabelBackground: '#0b1020',
    fontSize: '13px',
  },
  flowchart: { curve: 'basis', padding: 14, htmlLabels: true, nodeSpacing: 36, rankSpacing: 44 },
})

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    mermaid.render(`m${id}`, chart)
      .then(r => { if (alive) { setSvg(r.svg); setError('') } })
      .catch(e => { if (alive) setError(String(e?.message ?? e)) })
    return () => { alive = false }
  }, [chart, id])
  if (error) return <pre className="text-xs text-rose-300">{error}</pre>
  if (!svg) return <div className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />
  return <div className="mermaid-wrap flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
