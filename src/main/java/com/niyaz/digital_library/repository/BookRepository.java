package com.niyaz.digital_library.repository;

import com.niyaz.digital_library.entity.Book;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookRepository extends JpaRepository<Book, Integer> {
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select book from Book book where book.id = :id")
	java.util.Optional<Book> findByIdForUpdate(@Param("id") Integer id);
}