# 🏛️ Digital Library Management System — System Architecture & Technical Documentation

---

## 1. 📌 Executive Overview
The **Digital Library Management System (folio.)** is a modern, enterprise-grade full-stack web application. It integrates traditional library management processes (cataloging, loans, returns, and automated fine calculation) with cutting-edge **Generative AI** using **Retrieval-Augmented Generation (RAG)**.

- **Frontend:** React 19, Vite, Vanilla CSS Design System (Glassmorphism & Responsive Layout).
- **Backend:** Spring Boot 3, Spring Security 6, Spring Data JPA, Spring AI.
- **Relational DB:** MySQL 8.0 (ACID compliant, Pessimistic Locking).
- **Vector DB & AI:** In-Memory Vector Store, `nomic-embed-text` (768-dim embeddings), and `qwen3:1.7b` local LLM via Ollama.

---

## 2. 🏗️ High-Level System Architecture

```mermaid
graph TD
    Client["Client Browser (React 19 + Vite)<br/>Port: 5173"]
    
    subgraph Spring_Boot_Backend ["Spring Boot Backend (Port: 8080)"]
        Cors["CORS & Security Filter Chain"]
        JWT["JwtAuthenticationFilter<br/>(HMAC-SHA256 Token Validation)"]
        
        subgraph Controllers ["REST Controllers"]
            AuthController["LoginController (/api/auth)"]
            BookController["BookController (/api/books)"]
            IssueController["IssueController (/api/issues)"]
            FineController["FineController (/api/fines)"]
            AiController["AiController (/api/ai)"]
        end
        
        subgraph Services ["Business Logic Layer"]
            UserService["UserService (BCrypt, Session)"]
            BookService["BookService (Inventory Invariants)"]
            IssueService["IssueService (Pessimistic Locking)"]
            FineService["FineService (Day-diff calculation)"]
            ChatService["LibraryChatService (RAG Pipeline)"]
        end
    end
    
    subgraph Persistence ["Data & Vector Storage"]
        MySQL[("MySQL Database<br/>digital_library")]
        VectorStore[("In-Memory Vector Store<br/>Spring AI SimpleVectorStore")]
    end
    
    subgraph Local_AI_Engine ["Local AI (Ollama: 11434)"]
        Embedder["nomic-embed-text<br/>(Embedding Model)"]
        LLM["qwen3:1.7b<br/>(Chat Completion LLM)"]
    end

    Client -->|HTTP / REST + Bearer Token| Cors
    Cors --> JWT
    JWT --> Controllers
    
    AuthController --> UserService
    BookController --> BookService
    IssueController --> IssueService
    FineController --> FineService
    AiController --> ChatService
    
    UserService --> MySQL
    BookService --> MySQL
    IssueService --> MySQL
    FineService --> MySQL
    
    BookService -.->|afterCommit hook| ChatService
    ChatService --> VectorStore
    ChatService -->|Embed Document / Query| Embedder
    ChatService -->|Prompt + Context| LLM
```

---

## 3. 🤖 RAG (Retrieval-Augmented Generation) Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User as Student / User
    participant Frontend as React Client
    participant Controller as AiController (/api/ai/library-chat)
    participant Service as LibraryChatService
    participant VectorDB as VectorStore
    participant Ollama as Ollama (Local AI)

    User->>Frontend: Asks: "What books do you have on Java?"
    Frontend->>Controller: POST /api/ai/library-chat (Bearer Token)
    Controller->>Service: askLibraryQuestion("What books do you have on Java?")
    Service->>Ollama: Generate query embedding (nomic-embed-text)
    Ollama-->>Service: Return 768-dimensional vector
    Service->>VectorDB: similaritySearch(queryVector, topK=4)
    VectorDB-->>Service: Returns matching book documents (Title, Author, ISBN, Copies)
    Service->>Ollama: Prompt = System Instructions + Retrieved Context + User Query (qwen3)
    Ollama-->>Service: Generates grounded, hallucination-free answer
    Service-->>Controller: Return String answer
    Controller-->>Frontend: JSON { "answer": "..." }
    Frontend-->>User: Displays clean Markdown answer
```

---

## 4. 🗄️ Database Schema & ER Design

```mermaid
erDiagram
    USERS ||--o{ ISSUES : "borrows"
    BOOKS ||--o{ ISSUES : "issued in"
    ISSUES ||--o| FINES : "generates"

    USERS {
        int id PK "Auto Increment"
        string name "Full Name"
        string email UK "Unique Email Address"
        string password "BCrypt Hash"
        string role "STUDENT or ADMIN"
    }

    BOOKS {
        int id PK "Auto Increment"
        string title "Book Title"
        string author "Author Name"
        string isbn UK "Unique ISBN"
        string category "Genre / Subject"
        string cover_url "Optional image path"
        int quantity "Total Copies"
        int available_quantity "Remaining Copies"
    }

    ISSUES {
        int id PK "Auto Increment"
        int user_id FK "References USERS(id)"
        int book_id FK "References BOOKS(id)"
        date issue_date "Date of Issue"
        date due_date "Issue date + 14 days"
        date return_date "Actual Return Date"
        string status "ISSUED or RETURNED"
    }

    FINES {
        int id PK "Auto Increment"
        int issue_id FK "References ISSUES(id)"
        decimal amount "₹10 per overdue day"
        string status "UNPAID or PAID"
        datetime paid_at "Timestamp of payment"
    }
```

---

## 5. 🛡️ Concurrency & Enterprise Resiliency Patterns

### 1. Pessimistic Locking on Inventory (`PESSIMISTIC_WRITE`)
- **Problem:** If two students borrow the last copy (`availableQuantity = 1`) simultaneously, naive reads cause inventory to drop to `-1` (Oversell).
- **Solution:** 
  ```java
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT b FROM Book b WHERE b.id = :id")
  Optional<Book> findByIdForUpdate(@Param("id") Integer id);
  ```
  Generates `SELECT ... FOR UPDATE` in MySQL, acquiring an exclusive lock on the row until transaction completion.

### 2. Transactional Vector Synchronization (`afterCommit`)
- **Problem:** Updating vector stores inside an active database transaction leads to phantom data if MySQL rolls back.
- **Solution:** 
  ```java
  TransactionSynchronizationManager.registerSynchronization(
      new TransactionSynchronization() {
          @Override
          public void afterCommit() {
              libraryChatService.indexBook(savedBook);
          }
      }
  );
  ```

---

## 6. 🌐 REST API Endpoints Matrix

| HTTP Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticates credentials and returns JWT token |
| `POST` | `/api/users` | Public | Registers a new student account (`STUDENT` role) |
| `GET` | `/api/books` | Public | Retrieves all library books |
| `POST` | `/api/books` | **ADMIN** | Adds a new book and indexes it into vector store |
| `PUT` | `/api/books/{id}` | **ADMIN** | Updates book details and refreshes vector index |
| `DELETE` | `/api/books/{id}` | **ADMIN** | Deletes book (Blocked if active loans exist) |
| `GET` | `/api/issues` | Authenticated | Lists personal loans (or all loans if Admin) |
| `POST` | `/api/issues` | Authenticated | Borrows a book with row-locking validation |
| `POST` | `/api/issues/{id}/return` | Authenticated | Returns book, restores stock, triggers fine check |
| `GET` | `/api/fines` | Authenticated | Lists fines (Owner student or Admin) |
| `POST` | `/api/fines/{id}/pay` | Authenticated | Marks fine as PAID and records timestamp |
| `POST` | `/api/ai/library-chat` | Authenticated | RAG conversational assistant query |

---

## 7. 🚀 Local Run & Production Build Commands

### Backend:
```powershell
$env:DB_USERNAME="root"
$env:DB_PASSWORD="Sameer@123"
$env:JWT_SECRET="my_super_secret_jwt_key_at_least_32_characters_long_12345"
mvn spring-boot:run
```

### Frontend:
```powershell
cd frontend
npm run dev
```

### Automated Test Verification:
```powershell
mvn test
# Result: 7/7 tests passed (BUILD SUCCESS)
```
