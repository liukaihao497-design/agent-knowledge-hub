package com.lkh.test.knowledge;

import com.lkh.domain.knowlege.adapter.repository.IKnowledgeBaseRepository;
import com.lkh.domain.knowlege.model.entity.KnowledgeBaseEntity;
import com.lkh.domain.knowlege.model.valobj.KnowledgeException;
import com.lkh.domain.knowlege.service.KnowledgeBaseService;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class KnowledgeBaseServiceTest {

    private IKnowledgeBaseRepository repository;
    private KnowledgeBaseService service;

    @Before
    public void setup() {
        repository = mock(IKnowledgeBaseRepository.class);
        service = new KnowledgeBaseService(repository);
    }

    @Test
    public void createGeneratesIndependentIdsEvenForIdenticalNames() {
        var first = service.create(" Java 学习资料 ", " 领域设计 ");
        var second = service.create("Java 学习资料", null);
        assertNotEquals(first.getKnowledgeBaseId(), second.getKnowledgeBaseId());
        assertEquals(36, first.getKnowledgeBaseId().length());
        assertEquals("Java 学习资料", first.getName());
        assertEquals("领域设计", first.getDescription());
        assertEquals("", second.getDescription());
        assertEquals("ACTIVE", first.getStatus());
        verify(repository, times(2)).create(any());
    }

    @Test
    public void invalidNameDescriptionStatusAndPaginationDoNotReachRepository() {
        assertThrows(KnowledgeException.class, () -> service.create(" ", ""));
        assertThrows(KnowledgeException.class, () -> service.create("x".repeat(101), ""));
        assertThrows(KnowledgeException.class, () -> service.create("a\nb", ""));
        assertThrows(KnowledgeException.class, () -> service.create("a", "x".repeat(1001)));
        assertThrows(KnowledgeException.class, () -> service.changeStatus("demo", "DELETE"));
        assertThrows(KnowledgeException.class, () -> service.list("x", 1, 20));
        assertThrows(KnowledgeException.class, () -> service.list(null, 0, 20));
        assertThrows(KnowledgeException.class, () -> service.get("demo' OR 1=1"));
        verifyNoInteractions(repository);
    }

    @Test
    public void updatingDisplayInformationCannotMoveDocumentsOrChangeIdentity() {
        when(repository.find("demo")).thenReturn(base("demo", "旧名称", "ACTIVE"));
        var result = service.update("demo", "新的中文名称", "新说明");
        assertEquals("demo", result.getKnowledgeBaseId());
        assertEquals("ACTIVE", result.getStatus());
        var captor = ArgumentCaptor.forClass(KnowledgeBaseEntity.class);
        verify(repository).updateInformation(captor.capture());
        assertEquals("新的中文名称", captor.getValue().getName());
        verify(repository, never()).updateStatus(any());
    }

    @Test
    public void disablingAndEnablingKeepTheOriginalId() {
        var base = base("demo", "资料", "ACTIVE");
        when(repository.find("demo")).thenReturn(base);
        assertEquals("DISABLED", service.changeStatus("demo", "DISABLED").getStatus());
        assertEquals(409, assertThrows(KnowledgeException.class, () -> service.requireActive("demo")).getHttpStatus());
        assertEquals("ACTIVE", service.changeStatus("demo", "ACTIVE").getStatus());
        assertEquals("demo", service.requireActive("demo").getKnowledgeBaseId());
        verify(repository, times(2)).updateStatus(any());
        verify(repository, never()).create(any());
    }

    @Test
    public void missingBaseIsNotImplicitlyCreated() {
        assertEquals(404, assertThrows(KnowledgeException.class, () -> service.requireActive("missing")).getHttpStatus());
        verify(repository, never()).create(any());
    }

    @Test
    public void listUsesTheRequestedStatusAndPage() {
        when(repository.list("ACTIVE", 20, 10)).thenReturn(List.of(base("a", "资料", "ACTIVE")));
        when(repository.count("ACTIVE")).thenReturn(21L);
        var result = service.list("ACTIVE", 3, 10);
        assertEquals(21, result.total());
        assertEquals("a", result.items().get(0).getKnowledgeBaseId());
    }

    private KnowledgeBaseEntity base(String id, String name, String status) {
        return KnowledgeBaseEntity.builder().knowledgeBaseId(id).name(name).description("").status(status).build();
    }
}
