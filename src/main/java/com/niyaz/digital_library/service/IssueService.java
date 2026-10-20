package com.niyaz.digital_library.service;

import com.niyaz.digital_library.entity.Book;
import com.niyaz.digital_library.entity.Issue;
import com.niyaz.digital_library.repository.BookRepository;
import com.niyaz.digital_library.repository.IssueRepository;
import com.niyaz.digital_library.repository.UserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.util.List;

@Service
public class IssueService {

    private final IssueRepository issueRepository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final LibraryChatService libraryChatService;

    // Inject all required repositories and services.
    public IssueService(
            IssueRepository issueRepository,
            BookRepository bookRepository,
            UserRepository userRepository,
            LibraryChatService libraryChatService) {

        this.issueRepository = issueRepository;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
        this.libraryChatService = libraryChatService;
    }

    // Retrieve all issue records from the database.
    public List<Issue> getAllIssues() {
        return issueRepository.findAll();
    }

    public List<Issue> getIssuesForUser(Integer userId) {
        return issueRepository.findByUserId(userId);
    }

    // Refresh the AI search index after the database transaction commits.
    private void refreshBookIndexAfterCommit(Integer bookId) {

        Runnable refreshIndex = () -> {
            // Fetch the latest book information from the database.
            Book latestBook = bookRepository.findById(bookId)
                    .orElseThrow(() ->
                            new RuntimeException("Book not found with id: " + bookId));

            // Update the book information in the AI vector store.
            libraryChatService.indexBook(latestBook);
        };

        // Register the index update to run only after a successful commit.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {

            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {

                        @Override
                        public void afterCommit() {
                            refreshIndex.run();
                        }
                    });

        } else {
            // Refresh immediately when no transaction synchronization is active.
            refreshIndex.run();
        }
    }

    // Issue a book to a student and decrease its available quantity.
    @Transactional
    public Issue saveIssue(Issue issue, Integer authenticatedUserId, boolean admin) {

        if (!admin) {
            issue.setUserId(authenticatedUserId);
        }
        if (issue.getUserId() == null) {
            throw new IllegalArgumentException("A student must be selected");
        }

        // Verify that the student exists.
        userRepository.findById(issue.getUserId())
                .orElseThrow(() ->
                        new RuntimeException("Student not found"));

        // Find the requested book.
        Book book = bookRepository.findByIdForUpdate(issue.getBookId())
                .orElseThrow(() ->
                        new RuntimeException("Book not found"));

        // Prevent issuing a book when no copies are available.
        if (book.getAvailableQuantity() <= 0) {
            throw new RuntimeException("Book is not available");
        }

        // Decrease the available quantity by one.
        book.setAvailableQuantity(book.getAvailableQuantity() - 1);
        bookRepository.save(book);

        // Save the issue record in the database.
        if (issue.getIssueDate() == null) {
            issue.setIssueDate(LocalDate.now());
        }
        if (issue.getDueDate() == null) {
            issue.setDueDate(issue.getIssueDate().plusDays(14));
        }
        issue.setReturnDate(null);
        issue.setStatus("ISSUED");
        Issue savedIssue = issueRepository.save(issue);

        // Synchronize the AI index after the transaction commits.
        refreshBookIndexAfterCommit(book.getId());

        return savedIssue;
    }

    // Return an issued book and increase its available quantity.
    @Transactional
    public Issue returnBook(Integer issueId, Integer authenticatedUserId, boolean admin) {

        // Find the issue record using its ID.
        Issue issue = issueRepository.findByIdForUpdate(issueId)
                .orElseThrow(() ->
                        new RuntimeException("Issue record not found"));

        if (!admin && !issue.getUserId().equals(authenticatedUserId)) {
            throw new org.springframework.security.access.AccessDeniedException(
                "You can only return your own loans");
        }

        // Prevent the same book from being returned more than once.
        if ("RETURNED".equalsIgnoreCase(issue.getStatus())) {
            throw new RuntimeException("Book is already returned");
        }

        // Find the corresponding book.
        Book book = bookRepository.findByIdForUpdate(issue.getBookId())
                .orElseThrow(() ->
                        new RuntimeException("Book not found"));

        // Update the issue record with the return date and status.
        issue.setReturnDate(LocalDate.now());
        issue.setStatus("RETURNED");

        // Increase the available quantity after the book is returned.
        if (book.getAvailableQuantity() >= book.getQuantity()) {
            throw new IllegalStateException(
                "Book inventory is inconsistent; cannot return another copy");
        }
        book.setAvailableQuantity(book.getAvailableQuantity() + 1);
        bookRepository.save(book);

        // Save the updated issue record.
        Issue savedIssue = issueRepository.save(issue);

        // Refresh the AI index after the database transaction commits.
        refreshBookIndexAfterCommit(book.getId());

        return savedIssue;
    }
}
