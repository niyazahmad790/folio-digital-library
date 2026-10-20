package com.niyaz.digital_library.repository;

import com.niyaz.digital_library.entity.Issue;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

// Provides database operations for Issue records.
public interface IssueRepository extends JpaRepository<Issue, Integer> {
	List<Issue> findByUserId(Integer userId);

	boolean existsByBookIdAndStatusIgnoreCase(Integer bookId, String status);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select issue from Issue issue where issue.id = :id")
	Optional<Issue> findByIdForUpdate(@Param("id") Integer id);
}