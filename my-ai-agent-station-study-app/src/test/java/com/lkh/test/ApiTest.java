package com.lkh.test;

import cn.bugstack.wrench.design.framework.tree.StrategyHandler;
import com.alibaba.fastjson.JSON;
import com.lkh.domain.agent.model.entity.ArmoryCommandEntity;
import com.lkh.domain.agent.model.valobj.enums.AiAgentEnumVO;
import com.lkh.domain.agent.service.armory.factory.DefaultArmoryStrategyFactory;
import com.lkh.domain.agent.service.armory.factory.element.RagAnswerAdvisor;
import com.lkh.infrastructure.dao.IAiClientDao;
import io.minio.MinioClient;
import io.minio.ObjectWriteResponse;
import io.minio.UploadObjectArgs;
import io.minio.errors.*;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientSseClientTransport;
import io.modelcontextprotocol.server.McpSyncServer;
import lombok.extern.slf4j.Slf4j;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.junit4.SpringRunner;

import javax.annotation.Resource;
import java.io.IOException;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Arrays;

@Slf4j
@RunWith(SpringRunner.class)
@SpringBootTest
public class ApiTest {

//    private final static Logger logger = LoggerFactory.getLogger(ApiTest.class);
    @Autowired
    private IAiClientDao aiClientDao;
    @Autowired
    private DefaultArmoryStrategyFactory factory;
    @Resource
    private ApplicationContext applicationContext;
    @Resource
    private VectorStore vectorStore;



    @Test
    public void test() {
        aiClientDao.queryAll().stream().forEach(System.out::println);
        log.info("测试完成");
    }
    @Test
    public void testrag() {
        System.out.println(new RagAnswerAdvisor(vectorStore, SearchRequest.builder()
                .topK(5)
                .build()));
    }

    @Test
    public void testAgentAutoArmory(){
        cn.bugstack.wrench.design.framework.tree.StrategyHandler<ArmoryCommandEntity, DefaultArmoryStrategyFactory.DynamicContext, String> node = factory.getAgentArmoryHandler();
        try {
            node.apply( ArmoryCommandEntity.builder()
                    .commandType(AiAgentEnumVO.AI_CLIENT.getCode())
                    .commandIdList(Arrays.asList("3001"))
                    .build(), new DefaultArmoryStrategyFactory.DynamicContext());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        OpenAiApi bean =(OpenAiApi) applicationContext.getBean(AiAgentEnumVO.AI_CLIENT_API.getBeanName("1001"));
        log.info("当前获取到的bean实例为{}",bean);
    }

    @Test
    public void test_aiClientModelNode() throws Exception {
        StrategyHandler<ArmoryCommandEntity, DefaultArmoryStrategyFactory.DynamicContext, String> armoryStrategyHandler =
                factory.getAgentArmoryHandler();

        String apply = armoryStrategyHandler.apply(
                ArmoryCommandEntity.builder()
                        .commandType(AiAgentEnumVO.AI_CLIENT.getCode())
                        .commandIdList(Arrays.asList("3001"))
                        .build(),
                new DefaultArmoryStrategyFactory.DynamicContext());

        OpenAiChatModel openAiChatModel = (OpenAiChatModel) applicationContext.getBean(AiAgentEnumVO.AI_CLIENT_MODEL.getBeanName("2001"));

        log.info("模型构建:{}", openAiChatModel);

        // 1. 有哪些工具可以使用
        // 2. 在 /Users/fuzhengwei/Desktop 创建 txt.md 文件
        Prompt prompt = Prompt.builder()
                .messages(new UserMessage(
                        """
                                你自己内部具有查询工具吗，能查询网上的信息吗，我本地的工具能使用吗
                                """))
                .build();

        ChatResponse chatResponse = openAiChatModel.call(prompt);

        log.info("测试结果(call):{}", JSON.toJSONString(chatResponse));
    }

    @Test
    public void test_mcp_server(){

        HttpClientSseClientTransport build = HttpClientSseClientTransport.builder("http://appbuilder.baidu.com/v2/ai_search/mcp").sseEndpoint("/sse?api_key=REPLACE_WITH_TOKEN").build();

        McpSyncClient client = McpClient.sync(build)
                .requestTimeout(Duration.ofSeconds(10))
                .build();

        var initializeResult = client.initialize();

        System.out.println(initializeResult);
    }


}
