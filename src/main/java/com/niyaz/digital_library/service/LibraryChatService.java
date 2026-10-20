
package com.niyaz.digital_library.service;

import com.niyaz.digital_library.entity.Book;
import com.niyaz.digital_library.repository.BookRepository;

import jakarta.annotation.PostConstruct;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class LibraryChatService {

    private final BookRepository bookRepository;
    private final VectorStore vectorStore;
    private final ChatClient chatClient;

    public LibraryChatService(
            BookRepository bookRepository,
            VectorStore vectorStore,
            ChatClient.Builder chatClientBuilder) {

        this.bookRepository = bookRepository;
        this.vectorStore = vectorStore;
        this.chatClient = chatClientBuilder.build();
    }

    // Run once when the application starts.
    // Load current database books into the vector store.
    @PostConstruct
    public void indexBooks() {

        List<Book> books = bookRepository.findAll();

        for (Book book : books) {
            indexBook(book);
        }

        System.out.println("[RAG] Indexed " + books.size() + " library books.");
    }

    // Create a stable ID for every book's vector document.
    private String getDocumentId(Integer bookId) {
        return "library-book-" + bookId;
    }

    // Convert a book into a document and refresh its vector entry.
    public synchronized void indexBook(Book book) {

        String documentId = getDocumentId(book.getId());

        // Remove the previous version to prevent duplicate entries.
        vectorStore.delete(List.of(documentId));

        // Prepare book details for semantic search.
        String content = """
                Title: %s
                Author: %s
                Category: %s
                ISBN: %s
                Total quantity: %d
                Available quantity: %d
                """.formatted(
                book.getTitle(),
                book.getAuthor(),
                book.getCategory() == null
                        ? "Not specified" : book.getCategory(),
                book.getIsbn(),
                book.getQuantity(),
                book.getAvailableQuantity()
        );

        // Keep book ID and title as searchable-result metadata.
        Document document = new Document(
                documentId,
                content,
                Map.of(
                        "bookId", book.getId(),
                        "title", book.getTitle()
                )
        );

        // Generate the embedding and store the document.
        vectorStore.add(List.of(document));

    }

    // Remove a book's vector entry after the database book is deleted.
    public synchronized void removeBook(Integer bookId) {

        vectorStore.delete(List.of(getDocumentId(bookId)));

    }

    // Search relevant books and generate an answer using local AI.
    public String askLibraryQuestion(String question) {

        if (question == null || question.isBlank()) {
            throw new IllegalArgumentException(
                    "Question cannot be empty."
            );
        }

        // Retrieve the four most relevant documents.
        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(question)
                        .topK(4)
                        .build()
        );

        if (results == null || results.isEmpty()) {
            return "I could not find relevant information "
                    + "in the library. Please try another question.";
        }

        // Combine the retrieved book information into context.
        String context = results.stream()
                .map(Document::getText)
                .reduce((first, second) -> first + "\n\n" + second)
                .orElse("");

        // Ask the local Qwen model to answer using retrieved context.
        String answer = chatClient.prompt()
                .system("""
                        You are a helpful Digital Library Assistant.

                        Answer using only the library information
                        provided in the context.

                        Recommend relevant books when appropriate.
                        Never invent book titles, authors, ISBNs,
                        or quantities.

                        If the required information is missing,
                        clearly say that it was not found.

                        Use simple English and clear explanations.
                        """)
                .user("""
                        Library information:
                        %s

                        User question:
                        %s
                        """.formatted(context, question))
                .call()
                .content();

        return answer == null || answer.isBlank()
                ? "Sorry, I could not generate an answer. Please try again."
                : answer;
    }
}
