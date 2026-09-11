package com.lkh.trigger.http;

import com.lkh.api.IKnowledgeBaseApiService;
import com.lkh.api.dto.KnowledgeBaseRequestDTO;
import com.lkh.api.dto.KnowledgeBaseStatusRequestDTO;
import com.lkh.api.dto.KnowledgeResponseDTO.Base;
import com.lkh.api.dto.KnowledgeResponseDTO.Page;
import com.lkh.api.response.Response;
import com.lkh.domain.knowlege.model.entity.KnowledgeBaseEntity;
import com.lkh.domain.knowlege.service.IKnowledgeBaseService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

/** 知识库管理入口，与文档上传/问答共用 knowledge 功能开关。 */
@RestController
@RequestMapping("/api/v1/knowledge/bases")
@ConditionalOnProperty(name = "knowledge.enabled", havingValue = "true")
public class KnowledgeBaseController implements IKnowledgeBaseApiService {

    private final IKnowledgeBaseService service;

    public KnowledgeBaseController(IKnowledgeBaseService service) {
        this.service = service;
    }

    @Override
    @PostMapping
    public Response<Base> create(@RequestBody KnowledgeBaseRequestDTO request) {
        return ok(toBase(service.create(request.name(), request.description())));
    }

    @Override
    @GetMapping
    public Response<Page<Base>> list(@RequestParam(value = "status", required = false) String status,
                                     @RequestParam(value = "page", defaultValue = "1") int page,
                                     @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        var result = service.list(status, page, pageSize);
        return ok(new Page<>(result.items().stream().map(this::toBase).toList(), result.total(), page, pageSize));
    }

    @Override
    @GetMapping("/{knowledgeBaseId}")
    public Response<Base> get(@PathVariable("knowledgeBaseId") String knowledgeBaseId) {
        return ok(toBase(service.get(knowledgeBaseId)));
    }

    @Override
    @PutMapping("/{knowledgeBaseId}")
    public Response<Base> update(@PathVariable("knowledgeBaseId") String knowledgeBaseId,
                                 @RequestBody KnowledgeBaseRequestDTO request) {
        return ok(toBase(service.update(knowledgeBaseId, request.name(), request.description())));
    }

    @Override
    @PutMapping("/{knowledgeBaseId}/status")
    public Response<Base> changeStatus(@PathVariable("knowledgeBaseId") String knowledgeBaseId,
                                       @RequestBody KnowledgeBaseStatusRequestDTO request) {
        return ok(toBase(service.changeStatus(knowledgeBaseId, request.status())));
    }

    private Base toBase(KnowledgeBaseEntity entity) {
        return new Base(entity.getKnowledgeBaseId(), entity.getName(), entity.getDescription(), entity.getStatus(),
                entity.getCreateTime(), entity.getUpdateTime());
    }

    private <T> Response<T> ok(T data) {
        return Response.<T>builder().code("0000").info("成功").data(data).build();
    }

}
