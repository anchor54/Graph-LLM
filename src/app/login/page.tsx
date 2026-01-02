'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleSignUp = async () => {
    setLoading(true)
    setError(null)
    
    const redirectTo = `${window.location.origin}/auth/callback`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setError('Check your email for the confirmation link.')
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card border border-border rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-foreground">
          Welcome
        </h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Loading...' : 'Sign In'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleSignUp}
              disabled={loading}
            >
              Sign Up
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

