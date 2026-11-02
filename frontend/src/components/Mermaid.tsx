import mermaid from 'mermaid'
import { useEffect, useId, useState } from 'react'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'antiscript',
  theme: 'base',
  fontFamily: 'Geist, sans-serif',
  themeVariables: {
    darkMode: false,
    background: 'transparent',
    primaryColor: '#ffffff',
    primaryTextColor: '#1b1a18',
    primaryBorderColor: '#d3d0c9',
    lineColor: '#9b9890',
    secondaryColor: '#f6f5f2',
    tertiaryColor: '#f1f0ec',
    clusterBkg: '#faf9f7',
    clusterBorder: '#e5e3de',
    edgeLabelBackground: '#ffffff',
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
  if (error) return <pre className="text-xs text-bad">{error}</pre>
  if (!svg) return <div className="h-40 animate-pulse rounded-md bg-sunken" />
  return <div className="mermaid-wrap flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
