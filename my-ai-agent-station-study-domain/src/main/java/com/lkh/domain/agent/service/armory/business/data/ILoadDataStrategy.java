package com.lkh.domain.agent.service.armory.business.data;


import com.lkh.domain.agent.service.armory.factory.DefaultArmoryStrategyFactory;
import com.lkh.domain.agent.model.entity.ArmoryCommandEntity;

/**
 * 数据加载策略
 *
 * @author xiaofuge bugstack.cn @小傅哥
 * 2025/6/27 17:16
 */
public interface ILoadDataStrategy {

    void loadData(ArmoryCommandEntity armoryCommandEntity, DefaultArmoryStrategyFactory.DynamicContext dynamicContext);

}
