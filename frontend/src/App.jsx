
import { useEffect, useRef, useState } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'

const API_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const AI_TIMEOUT_MS = Number(import.meta.env.VITE_AI_TIMEOUT_MS) || 180000

async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem('token')
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (response.status === 401) {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    window.dispatchEvent(new Event('folio:session-expired'))
  }
  if (!response.ok) {
    const message = data?.error || data?.message || Object.values(data || {})[0]
    throw new Error(message || `Request failed (${response.status})`)
  }
  return data
}

export default function App() {
  const [books, setBooks] = useState([])
  const [booksLoading, setBooksLoading] = useState(true)
  const [booksError, setBooksError] = useState('')
  const [page, setPage] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'Admin' : 'Home')
  const [search, setSearch] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('user') || 'null') } catch { return null }
  })
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [showAuthPassword, setShowAuthPassword] = useState(false)
  const [notice, setNotice] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedBook, setSelectedBook] = useState(null)
  const [editingBook, setEditingBook] = useState(null)
  const [bookForm, setBookForm] = useState({ title: '', isbn: '', author: '', category: '', coverUrl: '', quantity: 1, availableQuantity: 1 })
  const [bookActionError, setBookActionError] = useState('')
  const [customCategories, setCustomCategories] = useState([])
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [accountData, setAccountData] = useState({ issues: [], fines: [], loading: false, error: '' })
  const [memberId, setMemberId] = useState('')
  const requestPending = useRef(false)
  const messagesEnd = useRef(null)

  useEffect(() => {
    const expireSession = () => {
      setUser(null)
      setAccountData({ issues: [], fines: [], loading: false, error: '' })
      setNotice('Your session expired. Please sign in again.')
    }
    const goHome = () => setPage('Home')
    window.addEventListener('folio:session-expired', expireSession)
    window.addEventListener('folio:home', goHome)
    return () => {
      window.removeEventListener('folio:session-expired', expireSession)
      window.removeEventListener('folio:home', goHome)
    }
  }, [])

  useEffect(() => {
    const syncAdminRoute = () => {
      setPage(window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'Admin' : 'Home')
    }
    window.addEventListener('popstate', syncAdminRoute)
    return () => window.removeEventListener('popstate', syncAdminRoute)
  }, [])

  useEffect(() => {
    const targetPath = page === 'Admin' ? '/admin' : '/'
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ folioPage: page }, '', targetPath)
    }
  }, [page])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  useEffect(() => {
    if (!selectedBook) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedBook(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedBook])

  useEffect(() => {
    async function loadBooks() {
      try {
        setBooksError('')
        const data = await apiRequest('/books')
        setBooks(Array.isArray(data) ? data : [])
      } catch (error) {
        setBooksError(
            error.message || 'Could not connect to the library service.'
        )
      } finally {
        setBooksLoading(false)
      }
    }

    loadBooks()
  }, [])

  useEffect(() => {
    if (!user) {
      return
    }
    let active = true
    Promise.all([apiRequest('/issues'), apiRequest('/fines')])
      .then(([issues, fines]) => {
        if (active) setAccountData({ issues: issues || [], fines: fines || [], loading: false, error: '' })
      })
      .catch((error) => {
        if (active) setAccountData({ issues: [], fines: [], loading: false, error: error.message })
      })
    return () => { active = false }
  }, [user])

  const categories = ['All', ...new Set([...books.map((book) => book.category).filter(Boolean), ...customCategories])]
  const filteredBooks = books.filter((book) =>
    (category === 'All' || book.category === category) &&
    `${book.title ?? ''} ${book.author ?? ''} ${book.category ?? ''}`.toLowerCase().includes(search.toLowerCase())
  )

  async function askAI(e) {
    e.preventDefault()

    const q = question.trim()
    if (!q || requestPending.current) return

    if (!user) {
      setNotice('Sign in to use the Library Assistant.')
      setPage('Account')
      return
    }

    requestPending.current = true
    setMessages((old) => [...old, { role: 'user', text: q }])
    setQuestion('')
    setLoading(true)

    try {
      const data = await apiRequest('/ai/library-chat', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      })
      setMessages((old) => [...old, { role: 'ai', text: data?.answer || 'The assistant returned an empty answer.' }])
    } catch (error) {
      setMessages((old) => [
        ...old,
        {
          role: 'ai',
          text: error.name === 'AbortError'
            ? 'The local assistant is taking longer than expected. Please try again shortly.'
            : error.name === 'TimeoutError'
              ? 'The local assistant is taking longer than expected. Please try again shortly.'
              : `I could not reach the library assistant: ${error.message}. Check that the backend and local AI service are available.`,
        },
      ])
    } finally {
      requestPending.current = false
      setLoading(false)
    }
  }

  async function submitAuth(e) {
    e.preventDefault()
    if (authLoading) return
    setAuthLoading(true)
    setAuthError('')
    try {
      if (page !== 'Admin' && authMode === 'register') {
        await apiRequest('/users', {
          method: 'POST',
            body: JSON.stringify({ name: authForm.name, email: authForm.email.trim(), password: authForm.password }),
        })
      }
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email.trim(), password: authForm.password }),
      })
      if (page === 'Admin' && result.role !== 'ADMIN') {
        throw new Error('This sign-in is for administrators only. Student accounts cannot access admin tools.')
      }
      sessionStorage.setItem('token', result.token)
      const profile = { id: result.userId, name: result.name, email: result.email, role: result.role }
      sessionStorage.setItem('user', JSON.stringify(profile))
      setUser(profile)
      setAccountData({ issues: [], fines: [], loading: true, error: '' })
      setAuthForm({ name: '', email: '', password: '' })
      setNotice(`Welcome, ${profile.name}.`)
      setPage(page === 'Admin' ? 'Admin' : 'Account')
    } catch (error) {
      const message = error.message || 'Sign in failed. Please try again.'
      setAuthError(authMode === 'login' && /invalid email or password/i.test(message)
        ? 'Login details did not match. If this is meant to be your admin account, make sure the one-time admin setup completed; public sign-up creates student accounts only.'
        : message)
    } finally {
      setAuthLoading(false)
    }
  }

  function signOut() {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setUser(null)
    setAccountData({ issues: [], fines: [], loading: false, error: '' })
    setPage('Home')
    setNotice('You have signed out.')
  }

  async function refreshBooks() {
    setBooksLoading(true)
    try {
      setBooks(await apiRequest('/books') || [])
      setBooksError('')
    } catch (error) {
      setBooksError(error.message)
    } finally {
      setBooksLoading(false)
    }
  }

  async function refreshAccount() {
    if (!user) return
    try {
      const [issues, fines] = await Promise.all([apiRequest('/issues'), apiRequest('/fines')])
      setAccountData({ issues: issues || [], fines: fines || [], loading: false, error: '' })
    } catch (error) {
      setAccountData((current) => ({ ...current, error: error.message, loading: false }))
    }
  }

  async function saveBook(e) {
    e.preventDefault()
    setBookActionError('')
    try {
      await apiRequest(editingBook ? `/books/${editingBook.id}` : '/books', {
        method: editingBook ? 'PUT' : 'POST',
        body: JSON.stringify({ ...bookForm, quantity: Number(bookForm.quantity), availableQuantity: Number(bookForm.availableQuantity) }),
      })
      setEditingBook(null)
      setBookForm({ title: '', isbn: '', author: '', category: '', coverUrl: '', quantity: 1, availableQuantity: 1 })
      setNotice(editingBook ? 'Book updated.' : 'Book added to the collection.')
      await refreshBooks()
    } catch (error) {
      setBookActionError(error.message)
    }
  }

  async function deleteBook(book) {
    if (!window.confirm(`Delete “${book.title}” from the collection?`)) return
    try {
      await apiRequest(`/books/${book.id}`, { method: 'DELETE' })
      setSelectedBook(null)
      setNotice('Book deleted.')
      await refreshBooks()
    } catch (error) {
      setBookActionError(error.message)
    }
  }

  async function borrowBook(book) {
    if (!user) {
      setSelectedBook(null)
      setPage('Account')
      setNotice('Sign in to borrow a book.')
      return
    }
    try {
      await apiRequest('/issues', { method: 'POST', body: JSON.stringify({ userId: Number(user.id), bookId: book.id }) })
      setNotice('Book issued. Your due date is 14 days from today.')
      setSelectedBook(null)
      await Promise.all([refreshBooks(), refreshAccount()])
    } catch (error) {
      setBookActionError(error.message)
    }
  }

  async function returnBook(issue) {
    try {
      await apiRequest(`/issues/${issue.id}/return`, { method: 'PUT' })
      await apiRequest(`/fines/${issue.id}/calculate`, { method: 'POST' })
      setNotice('Book returned. Any overdue fine has been recorded.')
      await Promise.all([refreshBooks(), refreshAccount()])
    } catch (error) {
      setNotice(error.message)
      await refreshAccount()
    }
  }

  async function payFine(fine) {
    try {
      await apiRequest(`/fines/${fine.id}/pay`, { method: 'PUT' })
      setNotice('Fine marked as paid.')
      await refreshAccount()
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
      <main className="site">
        <header className="site-header">
          <button
              className="wordmark"
              onClick={() => setPage('Home')}
              aria-label="Folio home"
          >
            <span className="brand-symbol">◈</span>
            <span>
            folio<span className="brand-accent">.</span>
          </span>
          </button>

          <nav className="top-nav">
            {['Home', 'Collection', 'AI Assistant', 'Account', 'Admin'].map((item) => (
                <button
                    key={item}
                    className={page === item ? 'nav-active' : ''}
                      aria-current={page === item ? 'page' : undefined}
                    onClick={() => setPage(item)}
                >
                  {item}
                </button>
            ))}
          </nav>

          <button
              className="header-cta"
              onClick={() => user ? signOut() : setPage('Account')}
          >
            {user ? 'Sign out' : 'Sign in'} <span>↗</span>
          </button>
        </header>

        {notice && <div className="site-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}

        {page === 'Home' && (
            <>
              <section className="hero">
                <div className="hero-glow" />
                <div className="hex-pattern hex-left">
                  ⬡<br />⬡　⬡<br />　⬡
                </div>

                <div className="hero-copy">
                  <div className="trust-pill">
                    <span /> YOUR NEXT CHAPTER STARTS HERE
                  </div>

                  <h1>
                    Ideas change
                    <br />
                    everything<span className="hero-period">.</span>
                  </h1>

                  <p className="hero-description">
                    Discover knowledge. Explore new perspectives.
                    A smarter digital library, built for curious minds.
                  </p>

                  <div className="hero-buttons">
                    <button
                        className="button-light"
                        onClick={() => setPage('Collection')}
                    >
                      Explore collection <span>↗</span>
                    </button>

                    <button
                        className="button-outline"
                        onClick={() => setPage('AI Assistant')}
                    >
                      Meet your AI <span>✳</span>
                    </button>
                  </div>

                  <div className="hero-caption">
                    <span className="caption-line" />
                    KNOWLEDGE WITHOUT LIMITS
                  </div>
                </div>

                <div className="hero-visual">
                  <div className="visual-glow" />
                  <div className="book-orbit orbit-a" />
                  <div className="book-orbit orbit-b" />
                  <div className="floating-label label-top">01 — DISCOVER</div>

                  <div className="book-stack">
                    <div className="hero-book hero-book-back">
                      <span>THE ART OF</span>
                      <strong>THINKING</strong>
                      <i>BEYOND LIMITS</i>
                    </div>

                    <div className="hero-book hero-book-mid">
                      <span>THE MODERN</span>
                      <strong>LIBRARY</strong>
                      <i>IDEAS IN MOTION</i>
                    </div>

                    <div className="hero-book hero-book-front">
                      <span>VOL. 001</span>
                      <strong>
                        KNOW
                        <br />
                        MORE.
                      </strong>
                      <i>READ · EXPLORE · GROW</i>

                      <div className="book-inside">
                        <span>WELCOME TO FOLIO</span>
                        <strong>
                          Every book opens
                          <br />a new world.
                        </strong>
                        <p>Discover ideas. Build skills. Imagine more.</p>
                      </div>
                    </div>
                  </div>

                  <div className="floating-label label-bottom">
                    A WORLD OF IDEAS ↗
                  </div>
                </div>
              </section>

              <section className="trust-strip">
                <span>BUILT FOR THE CURIOUS</span>
                <i />
                <span>YOUR KNOWLEDGE SPACE</span>
                <i />
                <span>POWERED BY INTELLIGENCE</span>
              </section>

              <section className="collection-section" id="collection">
                <div className="section-topline">
                  <span>01 / THE COLLECTION</span>
                  <span>SELECTED KNOWLEDGE</span>
                </div>

                <div className="section-title-row">
                  <div>
                    <h2>
                      Ideas worth
                      <br />
                      <span>exploring.</span>
                    </h2>
                  </div>

                  <div className="section-side">
                    <p>
                      From timeless fundamentals to modern technology,
                      find your next great read.
                    </p>
                    <button
                        className="underlined-link"
                        onClick={() => setPage('Collection')}
                    >
                      View all books ↗
                    </button>
                  </div>
                </div>

                {booksLoading ? (
                    <p className="preview-note">Loading books from your library…</p>
                ) : booksError ? (
                    <p className="preview-note">{booksError}</p>
                ) : books.length === 0 ? (
                    <p className="preview-note">
                      Abhi library mein books nahi mili hain.
                    </p>
                ) : (
                    <div className="book-grid">
                      {books.slice(0, 3).map((book) => (
                          <BookCard
                              key={book.id ?? book.title}
                              book={book}
                              onClick={() => setPage('Collection')}
                          />
                      ))}
                    </div>
                )}
              </section>

              <section className="ai-banner">
                <div className="ai-banner-orb">✳</div>
                <div>
              <span className="section-kicker">
                INTELLIGENCE, REIMAGINED
              </span>
                  <h2>
                    Questions lead to
                    <br />
                    better discoveries.
                  </h2>
                  <p>
                    Meet your library's AI assistant and explore knowledge
                    through conversation.
                  </p>
                </div>
                <button
                    className="button-light"
                    onClick={() => setPage('AI Assistant')}
                >
                  Explore AI assistant ↗
                </button>
              </section>

              <Footer />
            </>
        )}

        {page === 'Collection' && (
            <section className="inner-page">
              <div className="inner-heading">
                <span className="section-kicker">THE DIGITAL COLLECTION</span>
                <h1>
                  Find your next
                  <br />
                  <span>great idea.</span>
                </h1>
                <p>Explore books, authors and new perspectives.</p>
              </div>

              <div className="catalog-search">
                <span>⌕</span>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search books, authors or subjects..."
                    aria-label="Search books"
                />
                <span className="catalog-count">
              {booksLoading ? 'LOADING…' : `${filteredBooks.length} BOOKS`}
            </span>
              </div>

              <div className="catalog-toolbar">
                <div className="category-filters" aria-label="Filter by category">
                  {categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}
                </div>
                {user?.role === 'ADMIN' && <button className="button-light" onClick={() => { setEditingBook(null); setBookForm({ title: '', isbn: '', author: '', category: '', coverUrl: '', quantity: 1, availableQuantity: 1 }); document.getElementById('book-editor')?.scrollIntoView({ behavior: 'smooth' }) }}>Add book +</button>}
              </div>

              {user?.role === 'ADMIN' && <form id="book-editor" className="book-editor" onSubmit={saveBook}>
                <div className="editor-heading"><span className="section-kicker">ADMIN CATALOG</span><strong>{editingBook ? `Edit ${editingBook.title}` : 'Add a title'}</strong></div>
                <div className="editor-fields">
                  <label>Title<input required value={bookForm.title ?? ''} type="text" onChange={(e) => setBookForm((form) => ({ ...form, title: e.target.value }))} /></label>
                  <label>Author<input required value={bookForm.author ?? ''} type="text" onChange={(e) => setBookForm((form) => ({ ...form, author: e.target.value }))} /></label>
                  <label>ISBN<input required value={bookForm.isbn ?? ''} type="text" onChange={(e) => setBookForm((form) => ({ ...form, isbn: e.target.value }))} /></label>
                  <label>Category
                    {!isAddingNewCategory ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                          required
                          value={bookForm.category ?? ''}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            border: '1px solid #40362c',
                            background: '#0b0a09',
                            color: '#f7f3ed',
                            padding: '11px',
                            fontSize: '12px'
                          }}
                          onChange={(e) => {
                            if (e.target.value === '__NEW__') {
                              setIsAddingNewCategory(true)
                              setNewCategoryInput('')
                            } else {
                              setBookForm((form) => ({ ...form, category: e.target.value }))
                            }
                          }}
                        >
                          <option value="" disabled>Select category</option>
                          {categories.filter((cat) => cat !== 'All').map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__NEW__">+ Add New Category...</option>
                        </select>
                        <button
                          type="button"
                          className="button-outline"
                          style={{ padding: '8px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                          title="Create a new category"
                          onClick={() => {
                            setIsAddingNewCategory(true)
                            setNewCategoryInput('')
                          }}
                        >
                          + New
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          autoFocus
                          required
                          type="text"
                          placeholder="Enter new category name..."
                          value={newCategoryInput}
                          onChange={(e) => setNewCategoryInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="button-light"
                          style={{ padding: '8px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                          onClick={() => {
                            const trimmed = newCategoryInput.trim()
                            if (trimmed) {
                              setCustomCategories((prev) => Array.from(new Set([...prev, trimmed])))
                              setBookForm((form) => ({ ...form, category: trimmed }))
                              setIsAddingNewCategory(false)
                            }
                          }}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="button-outline"
                          style={{ padding: '8px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                          onClick={() => setIsAddingNewCategory(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </label>
                  <label>Cover image URL or path (optional)<input value={bookForm.coverUrl ?? ''} type="text" placeholder="/covers/clean-code.jpg" onChange={(e) => setBookForm((form) => ({ ...form, coverUrl: e.target.value }))} /></label>
                  <label>Total quantity<input required value={bookForm.quantity ?? ''} type="number" min={0} onChange={(e) => setBookForm((form) => ({ ...form, quantity: e.target.value }))} /></label>
                  <label>Available copies<input required value={bookForm.availableQuantity ?? ''} type="number" min={0} readOnly={Boolean(editingBook)} onChange={(e) => setBookForm((form) => ({ ...form, availableQuantity: e.target.value }))} /></label>
                </div>
                {bookActionError && <p className="form-error" role="alert">{bookActionError}</p>}
                <div className="editor-actions"><button type="submit" className="button-light">{editingBook ? 'Save changes' : 'Add to collection'}</button>{editingBook && <button type="button" className="button-outline" onClick={() => setEditingBook(null)}>Cancel</button>}</div>
              </form>}

              {booksError && <p className="preview-note">{booksError}</p>}

              {booksLoading ? (
                  <p className="preview-note">Loading your collection…</p>
              ) : !booksError && filteredBooks.length === 0 ? (
                  <p className="preview-note">
                    Koi matching book nahi mili. Search badal kar dekhein.
                  </p>
              ) : (
                  <div className="book-grid catalog-grid">
                    {filteredBooks.map((book) => (
                        <BookCard
                            key={book.id ?? book.title}
                            book={book}
                          onClick={() => { setSelectedBook(book); setBookActionError('') }}
                        />
                    ))}
                  </div>
              )}

              <Footer />
            </section>
        )}

        {page === 'AI Assistant' && (
            <section className="inner-page assistant-page">
              <div className="inner-heading">
            <span className="section-kicker">
              02 / YOUR KNOWLEDGE ASSISTANT
            </span>
                <h1>
                  Curiosity has
                  <br />
                  <span>no limits.</span>
                </h1>
                <p>Ask questions and discover what your library knows.</p>
              </div>

              <div className="assistant-panel">
                <div className="assistant-heading">
                  <div className="assistant-icon">✳</div>
                  <div>
                    <strong>Library Intelligence</strong>
                    <span>
                  <i /> Local assistant connection
                </span>
                  </div>
                </div>

                <div className="assistant-welcome">
                  <span>YOUR PERSONAL KNOWLEDGE SPACE</span>
                  <h2>What are you curious about?</h2>
                  <p>Ask about authors, books or library availability.</p>
                </div>

                <div className="prompt-list">
                  {[
                    'Who wrote Clean Code?',
                    'How many copies are available?',
                    'Recommend books for Java beginners',
                  ].map((q) => (
                      <button key={q} onClick={() => setQuestion(q)}>
                        {q} ↗
                      </button>
                  ))}
                </div>

                <div className="messages" aria-live="polite">
                  {messages.map((message, index) => (
                      <div
                          className={`message ${message.role}`}
                          key={`${index}-${message.role}`}
                      >
                  <span>
                    {message.role === 'user' ? 'YOU' : 'LIBRARY ASSISTANT'}
                  </span>
                        <div className="assistant-answer">
                          {message.role === 'user' ? (
                              <p>{message.text}</p>
                          ) : (
                              <ReactMarkdown>{message.text}</ReactMarkdown>
                          )}
                        </div>
                      </div>
                  ))}

                  {loading && (
                      <div className="message ai">
                        <span>LIBRARY ASSISTANT</span>
                        <p>Thinking… retrieving relevant information.</p>
                      </div>
                  )}
                  <div ref={messagesEnd} />
                </div>

                <form className="assistant-form" onSubmit={askAI}>
                  <input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Ask your library anything..."
                      aria-label="Ask the library assistant"
                      disabled={loading}
                  />
                  <button disabled={loading || !question.trim()}>
                    {loading ? 'Thinking…' : 'Send ↗'}
                  </button>
                </form>

                <p className="preview-note">
                  Assistant uses your configured Spring Boot backend and local
                  library knowledge.
                </p>
              </div>

              <Footer />
            </section>
        )}

        {page === 'Account' && (
          <section className="inner-page account-page">
            <div className="inner-heading">
              <span className="section-kicker">YOUR FOLIO</span>
              <h1>{user ? <>Welcome back,<br /><span>{user.name}.</span></> : <>A library that<br /><span>knows you.</span></>}</h1>
              <p>{user ? `${user.email} · ${user.role}` : 'Sign in or create a student account to borrow books and use the local library assistant.'}</p>
            </div>
            {!user ? <form className="auth-panel" onSubmit={submitAuth}>
              <div className="auth-tabs"><button type="button" className={authMode === 'login' ? 'selected' : ''} onClick={() => { setAuthMode('login'); setAuthError('') }}>Sign in</button><button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => { setAuthMode('register'); setAuthError('') }}>Create account</button></div>
              {authMode === 'register' && <label>Full name<input required autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} /></label>}
              <label>Email<input required type="email" autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
              <label>Password<span className="password-field"><input required type={showAuthPassword ? 'text' : 'password'} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /><button type="button" className="password-visibility" aria-label={showAuthPassword ? 'Hide password' : 'Show password'} aria-pressed={showAuthPassword} title={showAuthPassword ? 'Hide password' : 'Show password'} onClick={() => setShowAuthPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{showAuthPassword ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.5 3.1M6.2 6.2C4.2 7.4 2.9 9.5 2.5 11c1 1.8 4.5 6 9.5 6 1 0 2-.2 2.9-.6" /></> : <><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg></button></span></label>
              {authError && <p className="form-error" role="alert">{authError}</p>}
              <button className="button-light" disabled={authLoading}>{authLoading ? 'Please wait…' : authMode === 'login' ? 'Sign in ↗' : 'Create account ↗'}</button>
            </form> : <>
              <div className="account-stats">
                <div><span>IN YOUR LOAN HISTORY</span><strong>{accountData.issues.length}</strong></div>
                <div><span>ACTIVE LOANS</span><strong>{accountData.issues.filter((issue) => issue.status !== 'RETURNED').length}</strong></div>
                <div><span>UNPAID FINES</span><strong>{accountData.fines.filter((fine) => fine.status !== 'PAID').length}</strong></div>
                <div><span>COLLECTION TITLES</span><strong>{books.length}</strong></div>
              </div>
              {accountData.error && <p className="form-error" role="alert">{accountData.error}</p>}
              {accountData.loading ? <p className="preview-note">Loading your library activity…</p> : <>
                <section className="account-section"><div className="account-section-title"><h2>Loans</h2><span>{accountData.issues.length} RECORDS</span></div>
                  {accountData.issues.length === 0 ? <p className="preview-note">No loans yet. Browse the collection to get started.</p> : <div className="record-list">{accountData.issues.map((issue) => <div className="record-row" key={issue.id}><div><strong>{books.find((book) => book.id === issue.bookId)?.title || `Book #${issue.bookId}`}</strong><span>Issued {issue.issueDate} · Due {issue.dueDate}</span></div><span className={`record-status ${issue.status === 'RETURNED' ? 'complete' : ''}`}>{issue.status}</span>{issue.status !== 'RETURNED' && <button className="text-action" onClick={() => returnBook(issue)}>Return book</button>}</div>)}</div>}
                </section>
                <section className="account-section"><div className="account-section-title"><h2>Fines</h2><span>{accountData.fines.length} RECORDS</span></div>
                  {accountData.fines.length === 0 ? <p className="preview-note">No fines recorded.</p> : <div className="record-list">{accountData.fines.map((fine) => <div className="record-row" key={fine.id}><div><strong>Fine · ${Number(fine.amount).toFixed(2)}</strong><span>Loan #{fine.issueId}{fine.paidAt ? ` · Paid ${fine.paidAt}` : ''}</span></div><span className={`record-status ${fine.status === 'PAID' ? 'complete' : ''}`}>{fine.status}</span>{fine.status !== 'PAID' && <button className="text-action" onClick={() => payFine(fine)}>Mark paid</button>}</div>)}</div>}
                </section>
                {user.role === 'ADMIN' && <section className="account-section"><div className="account-section-title"><h2>Issue a book</h2><span>ADMIN ACTION</span></div><form className="issue-form" onSubmit={async (event) => { event.preventDefault(); try { await apiRequest('/issues', { method: 'POST', body: JSON.stringify({ userId: Number(memberId), bookId: Number(event.currentTarget.bookId.value) }) }); setNotice('Book issued to member.'); event.currentTarget.reset(); setMemberId(''); await Promise.all([refreshBooks(), refreshAccount()]) } catch (error) { setNotice(error.message) } }}><label>Member ID<input required type="number" min="1" value={memberId} onChange={(event) => setMemberId(event.target.value)} /></label><label>Book<select required name="bookId" defaultValue=""><option value="" disabled>Select a book</option>{books.map((book) => <option key={book.id} value={book.id} disabled={!book.availableQuantity}>{book.title} ({book.availableQuantity} available)</option>)}</select></label><button className="button-light">Issue book</button></form></section>}
              </>}
              <button className="button-outline signout-button" onClick={signOut}>Sign out</button>
            </>}
            <Footer />
          </section>
        )}

        {page === 'Admin' && (
          <section className="inner-page account-page admin-page">
            <div className="inner-heading">
              <span className="section-kicker">FOLIO ADMINISTRATION</span>
              <h1>{user?.role === 'ADMIN' ? <>Library<br /><span>control room.</span></> : <>Administrator<br /><span>sign in.</span></>}</h1>
              <p>{user?.role === 'ADMIN' ? `Signed in as ${user.email}` : 'Sign in with your administrator account to manage the library collection.'}</p>
            </div>
            {user?.role === 'ADMIN' ? <div className="admin-dashboard">
              <div className="account-stats">
                <div><span>BOOK TITLES</span><strong>{books.length}</strong></div>
                <div><span>LOAN RECORDS</span><strong>{accountData.issues.length}</strong></div>
                <div><span>ACTIVE LOANS</span><strong>{accountData.issues.filter((issue) => issue.status !== 'RETURNED').length}</strong></div>
                <div><span>UNPAID FINES</span><strong>{accountData.fines.filter((fine) => fine.status !== 'PAID').length}</strong></div>
              </div>
              <div className="admin-actions">
                <button className="button-light" onClick={() => setPage('Collection')}>Manage books ↗</button>
                <button className="button-outline" onClick={() => setPage('Account')}>View loans and fines</button>
                <button className="button-outline" onClick={signOut}>Sign out</button>
              </div>
            </div> : user ? <div className="auth-panel">
              <p className="form-error" role="alert">This account is a student account, not an administrator.</p>
              <button className="button-light" onClick={signOut}>Sign out to switch account</button>
            </div> : <form className="auth-panel" onSubmit={submitAuth}>
              <label>Email<input required type="email" autoComplete="username" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
              <label>Password<span className="password-field"><input required type={showAuthPassword ? 'text' : 'password'} autoComplete="current-password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /><button type="button" className="password-visibility" aria-label={showAuthPassword ? 'Hide password' : 'Show password'} aria-pressed={showAuthPassword} title={showAuthPassword ? 'Hide password' : 'Show password'} onClick={() => setShowAuthPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{showAuthPassword ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.5 3.1M6.2 6.2C4.2 7.4 2.9 9.5 2.5 11c1 1.8 4.5 6 9.5 6 1 0 2-.2 2.9-.6" /></> : <><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg></button></span></label>
              {authError && <p className="form-error" role="alert">{authError}</p>}
              <button className="button-light" disabled={authLoading}>{authLoading ? 'Please wait…' : 'Admin sign in ↗'}</button>
              <p className="admin-login-note">Need an admin account? It must be created using the one-time setup described in HELP.md.</p>
            </form>}
            <Footer />
          </section>
        )}

        {selectedBook && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBook(null) }}><section className="book-modal" role="dialog" aria-modal="true" aria-labelledby="book-modal-title"><button className="modal-close" aria-label="Close book details" onClick={() => setSelectedBook(null)}>×</button><span className="section-kicker">{selectedBook.category || 'GENERAL'}</span><h2 id="book-modal-title">{selectedBook.title}</h2><p className="modal-author">by {selectedBook.author}</p><dl><div><dt>ISBN</dt><dd>{selectedBook.isbn}</dd></div><div><dt>Availability</dt><dd>{selectedBook.availableQuantity} of {selectedBook.quantity} copies</dd></div></dl>{bookActionError && <p className="form-error" role="alert">{bookActionError}</p>}<div className="modal-actions">{user?.role === 'ADMIN' ? <><button className="button-light" onClick={() => { setEditingBook(selectedBook); setBookForm({ ...selectedBook }); setSelectedBook(null); setPage('Collection'); window.setTimeout(() => document.getElementById('book-editor')?.scrollIntoView({ behavior: 'smooth' }), 0) }}>Edit details</button><button className="button-outline" onClick={() => deleteBook(selectedBook)}>Delete</button></> : <button className="button-light" disabled={!selectedBook.availableQuantity} onClick={() => borrowBook(selectedBook)}>{selectedBook.availableQuantity ? 'Borrow this book' : 'Currently unavailable'}</button>}</div></section></div>}
      </main>
  )
}

function BookCard({ book, onClick }) {
  const isbn = (book.isbn || '').replace(/[^0-9Xx]/g, '')
  const imageSource = book.coverUrl || (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : '')
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)
  const title = book.title || 'Untitled book'
  const author = book.author || 'Author not specified'
  const category = book.category || 'General'
  const letter = title.charAt(0).toUpperCase()
  const available = Number(book.availableQuantity ?? 0)
  const total = Number(book.quantity ?? 0)

  const colors = ['cover-amber', 'cover-green', 'cover-blue', 'cover-red']
  const color = colors[(Number(book.id) || title.length) % colors.length]

  return (
      <button className="book-card" onClick={onClick}>
        <div className={`book-art ${color}`}>
          {imageSource && !coverFailed && <img className="book-cover-image" src={imageSource} alt={`Cover of ${title}`} loading="lazy" onLoad={() => setCoverLoaded(true)} onError={() => setCoverFailed(true)} />}
          <div className="book-art-top">{category}</div>
          {!coverLoaded && <div className="book-art-letter">{letter}</div>}
          <div className="book-art-bottom">FOLIO LIBRARY / 2026</div>
        </div>

        <div className="book-card-info">
          <span>{category}</span>
          <h3>{title}</h3>
          <p>{author}</p>
          <div className="book-card-bottom">
          <span>
            {available} / {total} available
          </span>
            <b>↗</b>
          </div>
        </div>
      </button>
  )
}

function Footer() {
  return (
      <footer className="site-footer">
        <button className="wordmark" aria-label="Folio home" onClick={() => window.dispatchEvent(new Event('folio:home'))}>
          <span className="brand-symbol">◈</span>
          <span>
          folio<span className="brand-accent">.</span>
        </span>
        </button>
        <span>A SPACE FOR KNOWLEDGE.</span>
        <span>DESIGNED FOR DISCOVERY © 2026</span>
      </footer>
  )
}
