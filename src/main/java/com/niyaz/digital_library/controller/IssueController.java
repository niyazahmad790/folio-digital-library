package com.niyaz.digital_library.controller;

import com.niyaz.digital_library.entity.Issue;
import com.niyaz.digital_library.service.IssueService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/issues")
public class IssueController {

    private final IssueService issueService;

    // Spring provides the IssueService automatically.
    public IssueController(IssueService issueService) {
        this.issueService = issueService;
    }

    // Create a new issue record.
    @PostMapping
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    public Issue createIssue(@RequestBody Issue issue, Authentication authentication) {
        return issueService.saveIssue(issue, userId(authentication), isAdmin(authentication));
    }

    // Get all issue records.
    @GetMapping
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    public List<Issue> getAllIssues(Authentication authentication) {
        return isAdmin(authentication)
                ? issueService.getAllIssues()
                : issueService.getIssuesForUser(userId(authentication));
    }

    // Return a book using its issue record ID.
    @PutMapping("/{issueId}/return")
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    public Issue returnBook(@PathVariable Integer issueId, Authentication authentication) {
        return issueService.returnBook(issueId, userId(authentication), isAdmin(authentication));
    }

    private Integer userId(Authentication authentication) {
        return Integer.valueOf(authentication.getName());
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }
}