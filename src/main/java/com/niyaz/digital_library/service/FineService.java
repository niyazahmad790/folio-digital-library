
package com.niyaz.digital_library.service;

import com.niyaz.digital_library.entity.Fine;
import com.niyaz.digital_library.entity.Issue;
import com.niyaz.digital_library.repository.FineRepository;
import com.niyaz.digital_library.repository.IssueRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class FineService {

    private static final BigDecimal FINE_PER_DAY =
            new BigDecimal("10.00");

    private final FineRepository fineRepository;
    private final IssueRepository issueRepository;

    public FineService(
            FineRepository fineRepository,
            IssueRepository issueRepository) {
        this.fineRepository = fineRepository;
        this.issueRepository = issueRepository;
    }

    public List<Fine> getFines(Integer userId, boolean admin) {
        if (admin) {
            return fineRepository.findAll();
        }
        List<Integer> issueIds = issueRepository.findByUserId(userId).stream()
                .map(Issue::getId)
                .collect(Collectors.toList());
        return issueIds.isEmpty() ? List.of() : fineRepository.findByIssueIdIn(issueIds);
    }

    // Calculate and save a fine when a book is returned late.
    @Transactional
    public Fine calculateFine(Integer issueId, Integer userId, boolean admin) {

        Issue issue = issueRepository.findById(issueId)
                .orElseThrow(() ->
                        new RuntimeException("Issue record not found"));
        assertOwner(issue, userId, admin);

        if (issue.getReturnDate() == null) {
            throw new RuntimeException(
                    "Return the book before calculating the fine");
        }

        long lateDays = ChronoUnit.DAYS.between(
                issue.getDueDate(),
                issue.getReturnDate()
        );

        if (lateDays <= 0) {
            return null;
        }

        if (fineRepository.existsByIssueId(issueId)) {
            throw new RuntimeException(
                    "Fine already exists for this issue");
        }

        Fine fine = new Fine();
        fine.setIssueId(issueId);
        fine.setAmount(
                FINE_PER_DAY.multiply(BigDecimal.valueOf(lateDays))
        );
        fine.setStatus("UNPAID");

        return fineRepository.save(fine);
    }

    // Mark a fine as paid and record the payment time.
    @Transactional
    public Fine payFine(Integer fineId, Integer userId, boolean admin) {

        Fine fine = fineRepository.findById(fineId)
                .orElseThrow(() ->
                        new RuntimeException("Fine record not found"));
        Issue issue = issueRepository.findById(fine.getIssueId())
            .orElseThrow(() -> new RuntimeException("Issue record not found"));
        assertOwner(issue, userId, admin);

        if ("PAID".equalsIgnoreCase(fine.getStatus())) {
            throw new RuntimeException("Fine is already paid");
        }

        fine.setStatus("PAID");
        fine.setPaidAt(java.time.LocalDateTime.now());

        return fineRepository.save(fine);
    }

    private void assertOwner(Issue issue, Integer userId, boolean admin) {
        if (!admin && !issue.getUserId().equals(userId)) {
            throw new AccessDeniedException("You can only access fines for your own loans");
        }
    }

}
