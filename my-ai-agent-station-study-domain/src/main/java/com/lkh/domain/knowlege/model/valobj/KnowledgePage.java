package com.lkh.domain.knowlege.model.valobj;

import java.util.List;

public record KnowledgePage<T>(List<T> items, long total, int page, int pageSize) {}
