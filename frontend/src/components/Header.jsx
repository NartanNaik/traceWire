import { Link } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme.js'
import { IconHelp, IconMoon, IconSun, Logo } from './Icons.jsx'

export default function Header({ onHints }) {
  const { theme, toggle } = useTheme()
  return (
    <header className="header">
      <Link to="/" className="brand" aria-label="Tracewire home">
        <Logo size={28} />
        <span>Tracewire</span>
      </Link>
      <div className="header-actions">
        <button className="btn btn-ghost btn-sm" onClick={onHints} title="Hints and shortcuts (?)">
          <IconHelp />
          <span className="hide-sm">Hints</span>
        </button>
        <button
          className="icon-btn"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  )
}