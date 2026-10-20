# 📚 Folio — Smart Digital Library with RAG AI Assistant

![Java](https://img.shields.io/badge/Java-17%2B-orange?logo=java)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen?logo=springboot)
![Spring AI](https://img.shields.io/badge/Spring%20AI-Ollama-blue)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![Vite](https://img.shields.io/badge/Vite-6.x-purple?logo=vite)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue?logo=mysql)
![License](https://img.shields.io/badge/License-MIT-green)

A modern, enterprise-ready full-stack Digital Library Management System featuring **Retrieval-Augmented Generation (RAG)**. Users can discover books, track loans, calculate dynamic late fines, and chat with an intelligent local AI assistant grounded strictly in verified library inventory.

---

## 🌟 Key Features

- **🤖 Local Generative AI (RAG):** Natural language book search and recommendations powered by local **Ollama** (`qwen3:1.7b` LLM + `nomic-embed-text` vector embeddings). Hallucination-free and privacy-focused.
- **🛡️ Enterprise Security:** Stateless **JWT (JSON Web Token)** authentication with HMAC-SHA256 and strict Role-Based Access Control (`STUDENT` vs `ADMIN`).
- **⚡ Concurrency Protection:** DB-level row locking (`PESSIMISTIC_WRITE`) preventing inventory overselling during concurrent loans.
- **💰 Automated Fine Engine:** Calculates dynamic late fees (`₹10/day`) upon book returns with clean HTTP response states.
- **🎨 Glassmorphism Dark UI:** Built with React 19, responsive layout, real-time live search, dynamic category filtering, and 3D interactive book opening animations.
- **🧪 100% Automated Test Coverage:** Unit test suite using JUnit 5, Mockito, and in-memory H2 database (`BUILD SUCCESS`).

---

## 🏗️ Architecture

```
[ React 19 Frontend (Vite: 5173) ]
               │
               ▼  REST API (JWT Bearer Token)
[ Spring Boot 3 Backend (Tomcat: 8080) ]
        ├── Security Filter Chain & RBAC
        ├── Business Logic (Pessimistic Locking & Fine Engine)
        └── Spring AI RAG Pipeline
               │
       ┌───────┴───────────────┐
       ▼                       ▼
 [ MySQL 8.0 ]       [ In-Memory VectorStore ]
(ACID Relational Data)         ▲
                               │ Embeddings / Prompt Context
                     [ Local Ollama Engine ]
                     ├── nomic-embed-text (Embeddings)
                     └── qwen3:1.7b (LLM Inference)
```

---

## 🚀 Quick Start Guide (Run Locally)

### 1. Prerequisites
Ensure you have the following installed:
- **Java 17+ (or 21)**
- **Maven 3.8+**
- **Node.js 18+ & npm**
- **MySQL 8.0+**
- **Ollama** ([Download here](https://ollama.com/))

---

### 2. Pull AI Models (Ollama)
Open a terminal and pull the local models:
```bash
ollama run qwen3:1.7b
ollama pull nomic-embed-text
```

---

### 3. Setup MySQL Database
Log in to your MySQL terminal or Workbench and create the database:
```sql
CREATE DATABASE digital_library;
```

---

### 4. Run the Backend (Spring Boot)
In the project root folder:
```powershell
# Set your environment variables
$env:DB_USERNAME="root"
$env:DB_PASSWORD="your_mysql_password"
$env:JWT_SECRET="my_super_secret_jwt_key_at_least_32_characters_long_12345"

# Run Spring Boot
mvn spring-boot:run
```
*Backend will start on: `http://localhost:8080`*

---

### 5. Run the Frontend (React + Vite)
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
*Frontend will be live on: `http://localhost:5173`*

---

## 🔑 Default Credentials

| Role | Email | Password | Access Rights |
|---|---|---|---|
| **Admin** | `admin@library.com` | `AdminPassword123` | Add/Edit/Delete Books, View All Loans, Manage Fines |
| **Student** | Register via UI | Min 8 characters | Browse Catalog, Borrow/Return Books, AI Assistant |

---

## 🧪 Running Automated Tests
Run isolated unit tests using the built-in in-memory H2 database:
```bash
mvn test
```
*Result: 7/7 tests passed (0 failures).*

---

## 📄 Documentation & Resources
- **System Architecture & ER Diagram:** See [ARCHITECTURE_AND_DOCS.md](./ARCHITECTURE_AND_DOCS.md)
- **20 Technical Interview Q&As:** See [Digital_Library_Interview_QA.pdf](./Digital_Library_Interview_QA.pdf)
