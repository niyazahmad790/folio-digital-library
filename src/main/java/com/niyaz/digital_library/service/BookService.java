
package com.niyaz.digital_library.service;

import java.util.List;

import com.niyaz.digital_library.entity.Book;
import com.niyaz.digital_library.repository.BookRepository;
import com.niyaz.digital_library.repository.IssueRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class BookService {

    private final BookRepository bookRepository;
    private final LibraryChatService libraryChatService;
    private final IssueRepository issueRepository;

    public BookService(
            BookRepository bookRepository,
            LibraryChatService libraryChatService,
            IssueRepository issueRepository) {

        this.bookRepository = bookRepository;
        this.libraryChatService = libraryChatService;
        this.issueRepository = issueRepository;
    }

    // Save a new book and add it to the AI vector index.
    @Transactional
    public Book saveBook(Book book) {

        validateInventory(book.getQuantity(), book.getAvailableQuantity());

        Book savedBook = bookRepository.save(book);

        refreshBookIndexAfterCommit(savedBook.getId());

        return savedBook;
    }

    // Return all books from MySQL.
    public List<Book> getAllBooks() {
        return bookRepository.findAll();
    }

    // Find one book by ID or report that it does not exist.
    public Book getBookById(Integer id) {

        return bookRepository.findById(id)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Book not found with id: " + id
                        ));
    }

    // Update an existing book and refresh its AI document.
    @Transactional
    public Book updateBook(Integer id, Book updatedBook) {

        // Find the existing database record.
        Book existingBook = getBookById(id);
        int issuedCopies = existingBook.getQuantity() - existingBook.getAvailableQuantity();

        if (updatedBook.getQuantity() < issuedCopies) {
            throw new IllegalArgumentException(
                "Total quantity cannot be less than the number of issued copies");
        }
        validateQuantity(updatedBook.getQuantity());

        // Update the book fields.
        existingBook.setTitle(updatedBook.getTitle());
        existingBook.setIsbn(updatedBook.getIsbn());
        existingBook.setAuthor(updatedBook.getAuthor());
        existingBook.setCategory(updatedBook.getCategory());
        existingBook.setCoverUrl(updatedBook.getCoverUrl());
        existingBook.setQuantity(updatedBook.getQuantity());
        existingBook.setAvailableQuantity(updatedBook.getQuantity() - issuedCopies);

        // Save the updated record in MySQL.
        Book savedBook = bookRepository.save(existingBook);

        refreshBookIndexAfterCommit(savedBook.getId());

        return savedBook;
    }

    // Delete a book from MySQL and remove its AI document.
    @Transactional
    public void deleteBook(Integer id) {

        // Verify that the book exists.
        Book existingBook = getBookById(id);

        if (issueRepository.existsByBookIdAndStatusIgnoreCase(id, "ISSUED")) {
            throw new IllegalArgumentException(
                "Cannot delete a book while copies are on loan");
        }

        // Delete from the database first.
        bookRepository.delete(existingBook);

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            libraryChatService.removeBook(id);
                        }
                    });
        } else {
            libraryChatService.removeBook(id);
        }
    }

    private void refreshBookIndexAfterCommit(Integer bookId) {
        Runnable refresh = () -> bookRepository.findById(bookId)
                .ifPresent(libraryChatService::indexBook);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            refresh.run();
                        }
                    });
        } else {
            refresh.run();
        }
    }

    private void validateInventory(Integer quantity, Integer availableQuantity) {
        validateQuantity(quantity);
        if (availableQuantity == null || availableQuantity < 0
                || availableQuantity > quantity) {
            throw new IllegalArgumentException(
                    "Available quantity must be between zero and total quantity");
        }
    }

    private void validateQuantity(Integer quantity) {
        if (quantity == null || quantity < 0) {
            throw new IllegalArgumentException("Total quantity cannot be negative");
        }
    }
}
