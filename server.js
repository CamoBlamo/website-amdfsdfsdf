// server.js
const express = require("express")
const bcrypt = require("bcrypt")
const session = require("express-session")
const fs = require("fs")
const path = require("path")

const app = express()
const PORT = 3000

// ---- DATABASE FILE ----
const dbFile = path.join(__dirname, "users.json")

const getUsers = () => {
  if (!fs.existsSync(dbFile)) return {}
  return JSON.parse(fs.readFileSync(dbFile))
}

const saveUsers = (users) => {
  fs.writeFileSync(dbFile, JSON.stringify(users, null, 2))
}

// ---- MIDDLEWARE ----
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
  })
)

// ---- SERVE STATIC HTML ----
app.get("/signup.html", (req, res) => {
  res.sendFile(path.join(__dirname, "signup.html"))
})

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"))
})

// ---- MAIN PAGE (PROTECTED) ----
app.get("/mainpage.html", (req, res) => {
  if(!req.session.user) return res.redirect("/login.html")
  res.sendFile(path.join(__dirname, "mainpage.html"))
})

// ---- SIGNUP HANDLER ----
app.post("/signup", async (req, res) => {
  const { email, password } = req.body
  if(!email || !password) return res.send("missing fields")

  const users = getUsers()
  if(users[email]) return res.send("account already exists")

  const hash = await bcrypt.hash(password, 10)
  users[email] = hash
  saveUsers(users)

  res.redirect("/login.html")
})

// ---- LOGIN HANDLER ----
app.post("/login", async (req, res) => {
  const { email, password } = req.body
  const users = getUsers()

  if(!users[email]) return res.send("no account found")

  const match = await bcrypt.compare(password, users[email])
  if(!match) return res.send("wrong password")

  req.session.user = email
  res.redirect("/mainpage.html")
})

// ---- LOGOUT ----
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if(err) return res.send("error logging out")
    res.redirect("/login.html")
  })
})

// ---- START SERVER ----
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`))
