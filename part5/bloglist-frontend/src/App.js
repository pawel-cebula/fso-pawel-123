import React, { useState, useEffect, useRef } from 'react'
import Login from './components/Login'
import Blog from './components/Blog'
import NewBlogForm from './components/NewBlogForm'
import ErrorBox from './components/ErrorBox'
import SuccessBox from './components/SuccessBox'
import Togglable from './components/Togglable'
import loginService from './services/login'
import blogService from './services/blogs'

const App = () => {
  const [blogs, setBlogs] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)

  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  const newBlogFormRef = useRef()

  useEffect(() => {
    blogService.getAll().then(blogs =>
      setBlogs(blogs.sort((a, b) => b.likes - a.likes))
    )
  }, [])

  useEffect(() => {
    const loggedUserJSON = window.localStorage.getItem('loggedBloglistUser')
    if (loggedUserJSON) {
      const user = JSON.parse(loggedUserJSON)
      setUser(user)
      blogService.setToken(user.token)
    }
  }, [])

  const loginForm = () => (
    <div>
      <h2>Log in to application</h2>
      <Login username={username} setUsername={setUsername} password={password} setPassword={setPassword} handleLogin={handleLogin} />
    </div>
  )

  const blogSection = () => {
    return (
      <div>
        <h2>blogs</h2>
        <Togglable buttonLabel='new blog form' ref={newBlogFormRef}>
          <NewBlogForm addBlog={addBlog} />
        </Togglable>
        <p>{user.name} logged in <button onClick={handleLogout}>Log out</button></p>
        {blogs.map(blog =>
          <Blog
            key={blog.id}
            blog={blog}
            currentUsername={user.username}
            updateBlog={() => updateBlog(blog.id)}
            removeBlog={() => removeBlog(blog.id)}
          />
        )}
      </div>
    )
  }

  const handleLogin = async (event) => {
    event.preventDefault()

    try {
      const user = await loginService.login({ username, password })
      blogService.setToken(user.token)
      window.localStorage.setItem('loggedBloglistUser', JSON.stringify(user))
      setUser(user)
      setUsername('')
      setPassword('')
      setSuccessMessage('successfully logged in')
      setTimeout(() => {
        setSuccessMessage(null)
      }, 5000)
    } catch (err) {
      setErrorMessage('wrong credentials')
      setTimeout(() => {
        setErrorMessage(null)
      }, 5000)
    }
  }

  const handleLogout = () => {
    window.localStorage.removeItem('loggedBloglistUser')
    setUser(null)
  }

  const addBlog = async (newObject) => {
    try {
      newBlogFormRef.current.toggleVisibility()
      const newBlog = await blogService.create(newObject)
      setBlogs(blogs.concat(newBlog))
      setSuccessMessage(`Successfully added ${newBlog.title} by ${newBlog.author}`)
      setTimeout(() => {
        setSuccessMessage(null)
      }, 5000)
    } catch (error) {
      setErrorMessage('Couldn\'t add the blog')
      setTimeout(() => {
        setErrorMessage(null)
      }, 5000)
    }
  }

  const updateBlog = (blogId) => {
    const updatedBlogs = blogs.map(blog => {
      if (blog.id === blogId) {
        blog.likes = blog.likes + 1
      }
      return blog
    })
    setBlogs(updatedBlogs)
  }

  const removeBlog = (blogId) => {
    const updatedBlogs = blogs.filter(blog => blog.id !== blogId)
    setBlogs(updatedBlogs)
  }

  return (
    <div>
      {errorMessage && <ErrorBox error={errorMessage} />}
      {successMessage && <SuccessBox success={successMessage} />}
      {user === null ?
        loginForm() :
        blogSection()
      }
    </div>
  )
}

export default App