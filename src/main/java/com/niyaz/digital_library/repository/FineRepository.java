
package com.niyaz.digital_library.repository;

import com.niyaz.digital_library.entity.Fine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Provides database operations for fine records.
public interface FineRepository extends JpaRepository<Fine, Integer> {
    boolean existsByIssueId(Integer issueId);
    List<Fine> findByIssueIdIn(List<Integer> issueIds);
}
