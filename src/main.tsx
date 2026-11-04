import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/app.css'
import './styles/crepe-overrides.css'

// 不使用 React.StrictMode：
// Crepe 编辑器是命令式单实例，StrictMode 的 mount → unmount → mount 会把它销毁，
// 而 bootEditor 的幂等保护又不允许重建，开发模式下会得到一个空白编辑器。
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
