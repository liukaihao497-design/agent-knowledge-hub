package com.lkh.api;

import com.lkh.api.dto.KnowledgeBaseRequestDTO;
import com.lkh.api.dto.KnowledgeBaseStatusRequestDTO;
import com.lkh.api.dto.KnowledgeResponseDTO.Base;
import com.lkh.api.dto.KnowledgeResponseDTO.Page;
import com.lkh.api.response.Response;

public interface IKnowledgeBaseApiService {

    Response<Base> create(KnowledgeBaseRequestDTO request);

    Response<Page<Base>> list(String status, int page, int pageSize);

    Response<Base> get(String knowledgeBaseId);

    Response<Base> update(String knowledgeBaseId, KnowledgeBaseRequestDTO request);

    Response<Base> changeStatus(String knowledgeBaseId, KnowledgeBaseStatusRequestDTO request);

}
