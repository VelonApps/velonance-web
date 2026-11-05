import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Layout from './Layout'
import { Loading } from './ui'
export default function Protected() {
  const { authorization, loading } = useAuth()
  return loading ? <Loading /> : authorization ? <Layout /> : <Navigate to="/login" replace />
}
