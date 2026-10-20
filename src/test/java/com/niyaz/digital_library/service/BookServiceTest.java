package com.niyaz.digital_library.service;

import com.niyaz.digital_library.entity.Book;
import com.niyaz.digital_library.repository.BookRepository;
import com.niyaz.digital_library.repository.IssueRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BookServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private LibraryChatService libraryChatService;

    @Mock
    private IssueRepository issueRepository;

    @InjectMocks
    private BookService bookService;

    private Book sampleBook;

    @BeforeEach
    void setUp() {
        sampleBook = new Book();
        sampleBook.setId(1);
        sampleBook.setTitle("Spring Boot in Action");
        sampleBook.setQuantity(5);
        sampleBook.setAvailableQuantity(5);
    }

    @Test
    void saveBook_validInventory_savesSuccessfully() {
        when(bookRepository.save(any(Book.class))).thenReturn(sampleBook);

        Book saved = bookService.saveBook(sampleBook);

        assertNotNull(saved);
        assertEquals("Spring Boot in Action", saved.getTitle());
        verify(bookRepository, times(1)).save(sampleBook);
    }

    @Test
    void saveBook_invalidAvailableQuantity_throwsIllegalArgumentException() {
        sampleBook.setAvailableQuantity(10); // more than total quantity (5)

        assertThrows(IllegalArgumentException.class, () ->
                bookService.saveBook(sampleBook)
        );
        verify(bookRepository, never()).save(any());
    }

    @Test
    void deleteBook_whenActiveLoansExist_throwsIllegalArgumentException() {
        when(bookRepository.findById(1)).thenReturn(Optional.of(sampleBook));
        when(issueRepository.existsByBookIdAndStatusIgnoreCase(1, "ISSUED")).thenReturn(true);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                bookService.deleteBook(1)
        );

        assertTrue(ex.getMessage().contains("Cannot delete a book while copies are on loan"));
        verify(bookRepository, never()).delete(any());
    }
}
