package com.niyaz.digital_library.service;

import com.niyaz.digital_library.entity.Fine;
import com.niyaz.digital_library.entity.Issue;
import com.niyaz.digital_library.repository.FineRepository;
import com.niyaz.digital_library.repository.IssueRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FineServiceTest {

    @Mock
    private FineRepository fineRepository;

    @Mock
    private IssueRepository issueRepository;

    @InjectMocks
    private FineService fineService;

    private Issue sampleIssue;

    @BeforeEach
    void setUp() {
        sampleIssue = new Issue();
        sampleIssue.setId(101);
        sampleIssue.setUserId(1);
        sampleIssue.setDueDate(LocalDate.of(2026, 3, 1));
    }

    @Test
    void calculateFine_onTimeReturn_returnsNull() {
        sampleIssue.setReturnDate(LocalDate.of(2026, 3, 1)); // exactly on due date
        when(issueRepository.findById(101)).thenReturn(Optional.of(sampleIssue));

        Fine result = fineService.calculateFine(101, 1, false);

        assertNull(result, "On-time return should produce no fine (null)");
        verify(fineRepository, never()).save(any());
    }

    @Test
    void calculateFine_lateReturn_createsFine() {
        sampleIssue.setReturnDate(LocalDate.of(2026, 3, 4)); // 3 days late
        when(issueRepository.findById(101)).thenReturn(Optional.of(sampleIssue));
        when(fineRepository.existsByIssueId(101)).thenReturn(false);
        when(fineRepository.save(any(Fine.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Fine fine = fineService.calculateFine(101, 1, false);

        assertNotNull(fine);
        assertEquals(new BigDecimal("30.00"), fine.getAmount(), "Fine should be 3 days * 10.00 = 30.00");
        assertEquals("UNPAID", fine.getStatus());
        verify(fineRepository, times(1)).save(any(Fine.class));
    }

    @Test
    void calculateFine_unauthorizedUser_throwsAccessDenied() {
        when(issueRepository.findById(101)).thenReturn(Optional.of(sampleIssue));

        assertThrows(AccessDeniedException.class, () ->
                fineService.calculateFine(101, 2, false)
        );
    }
}
