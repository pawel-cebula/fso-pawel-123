require('dotenv').config();
const { ApolloServer, gql, UserInputError, AuthenticationError, PubSub } = require('apollo-server')
const { v4: uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')
const pubsub = new PubSub()
const mongoose = require('mongoose')
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')

const JWT_SECRET = process.env.JWT_SECRET

const MONGO_URI = process.env.MONGO_URI

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
  .then(() => { console.log('connected to MongoDB')})
  .catch((error) => { console.log('error connecting to MongoDB', error.message)})

const typeDefs = gql`
  type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }  

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
    allGenres: [String!]!
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book
    editAuthor(
      name: String!
      setBornTo: Int!
    ): Author
    createUser(
      username: String!,
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }

  type Subscription {
    bookAdded: Book!
  }
`

const resolvers = {
  Query: {
    bookCount: () => Book.collection.countDocuments(),
    authorCount: () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      const books = await Book.find({}).populate('author')
      
      if (!args.author && !args.genre) {
        return books
      }

      const byAuthor = book => book.author.name === args.author
      const byGenre = book => book.genres.includes(args.genre)

      const filteredBooks = args.author
          ? args.genre
            ? books.filter(byAuthor).filter(byGenre)
            : books.filter(byAuthor)
          : books.filter(byGenre)

      return filteredBooks
    },
    allAuthors: () => {
      return Author.find({})
    }, 
    me: (root, args, context) => {
      return context.currentUser
    },
    allGenres: async() => {
      const books = await Book.find({})
      const genres = books.flatMap(book => book.genres)
      const uniqueGenres = genres.filter((genre, index) => {
        return genres.indexOf(genre) === index
      })
      return uniqueGenres
    }
  },
  Author: {
    bookCount: (root) => {
      return Book.count({ author: root._id })
    } 
  },
  Mutation: {
    addBook: async (root, args, context) => {
      if (!context.currentUser) {
        throw new AuthenticationError('not authenticated')
      }

      let author = await Author.findOne({ name: args.author })
      if (!author) {
        author = new Author({ name: args.author })
        try {
          await author.save()
        } catch (error) {
          throw new UserInputError(error.message, {
            invalidArgs: args
          })
        }
      }

      const book = new Book({
        title: args.title,
        published: args.published,
        author: author._id,
        genres: args.genres,
      })

      try {
        await book.save()
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args
        })
      }

      if (author && book) {
        author.books = author.books.concat(book._id)
      }

      await author.save()
      
      await book.populate('author').execPopulate()

      pubsub.publish('BOOK_ADDED', { bookAdded: book })

      return book
    },
    editAuthor: async (root, args, context) => {
      if (!context.currentUser) {
        throw new AuthenticationError('not authenticated')
      }

      const authorToEdit = await Author.findOne({ name: args.name })

      if (authorToEdit && args.setBornTo) {
        authorToEdit.born = args.setBornTo
        return authorToEdit.save()
      }

      return null
    },
    createUser: async (root, args) => {
      const user = new User({ ...args })

      return user.save()
        .catch(error => {
          throw new UserInputError(error.message, {
            invalidArgs: args
          })
        })
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if (!user || args.password !== 'secret') {
        throw new UserInputError('wrong credentials')
      }

      const userForToken = {
        username: user.username,
        id: user._id
      }

      return { value: jwt.sign(userForToken, JWT_SECRET) }
    }
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const decodedToken = jwt.verify(auth.substring(7), JWT_SECRET)
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  }
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})