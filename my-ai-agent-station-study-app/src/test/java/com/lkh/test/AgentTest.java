package com.lkh.test;

import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientSseClientTransport;
import io.modelcontextprotocol.client.transport.ServerParameters;
import io.modelcontextprotocol.client.transport.StdioClientTransport;
import io.modelcontextprotocol.spec.McpSchema;
import org.junit.Assume;
import org.junit.Test;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class AgentTest {

    private static final String APPBUILDER_BASE_URI = "https://appbuilder.baidu.com/v2/ai_search/mcp/";
    private static final String APPBUILDER_API_KEY_ENV = "BAIDU_APPBUILDER_API_KEY";

    /**
     * 百度 AI 搜索 MCP 联调测试。
     *
     * 运行前请配置环境变量：BAIDU_APPBUILDER_API_KEY=bce-v3/...
     */
    @Test
    public void testmcp3(){
        String apiKey = System.getenv("BAIDU_APPBUILDER_API_KEY");
        HttpClientSseClientTransport build = HttpClientSseClientTransport
                .builder("https://appbuilder.baidu.com/v2/ai_search/mcp/")
                .sseEndpoint("sse?api_key=REPLACE_WITH_TOKEN")
//                .builder(APPBUILDER_BASE_URI)
//                .sseEndpoint(buildSseEndpoint(apiKey))
                .build();

        McpSyncClient client = McpClient.sync(build)
                .requestTimeout(Duration.ofSeconds(30))
                .build();

        var initializeResult = client.initialize();

        System.out.println(initializeResult);
    }
   @Test
    public void testmcp2() {
        String apiKey = System.getenv("BAIDU_APPBUILDER_API_KEY");
        Assume.assumeTrue(
                "未配置环境变量 " + APPBUILDER_API_KEY_ENV + "，跳过真实 MCP 连接测试",
                apiKey != null && !apiKey.isBlank()
        );
        assertTrue("AppBuilder API Key 应以 bce-v3/ 开头", apiKey.startsWith("bce-v3/"));

        HttpClientSseClientTransport transport = HttpClientSseClientTransport.builder(APPBUILDER_BASE_URI)
                .sseEndpoint(buildSseEndpoint(apiKey))
                .build();

        try (McpSyncClient client = McpClient.sync(transport)
                .requestTimeout(Duration.ofSeconds(30))
                .build()) {
            client.initialize();
            assertNotNull("MCP initialize 响应不能为空", client.initialize());
        }
    }

    @Test
    public void shouldBuildCorrectAppBuilderSseEndpoint() {
        assertEquals(
                "sse?api_key=REPLACE_WITH_TOKEN",
                buildSseEndpoint("bce-v3/example")
        );
    }

    private static String buildSseEndpoint(String apiKey) {
        return "sse?api_key=REPLACE_WITH_TOKEN" + apiKey;
    }

    @Test
    public void stdioMcpClientElasticsearch() {

        Map<String, String> env = new HashMap<>();
        env.put("ES_URL","http://127.0.0.1:9200");
        env.put("ES_API_KEY","none");
        env.put("OTEL_LOG_LEVEL", "none");

        var stdioParams = ServerParameters.builder("E://Java//nodejs//nodejs//npx.cmd")
                .args("-y", "@elastic/mcp-server-elasticsearch")
                .env(env)
                .build();

        var mcpClient = McpClient.sync(new StdioClientTransport(stdioParams))
                .requestTimeout(Duration.ofSeconds(100)).build();

        var init = mcpClient.initialize();
        McpSchema.ListToolsResult tools = mcpClient.listTools();
        tools.tools().forEach(System.out::println);
        var result = mcpClient.callTool(
                new McpSchema.CallToolRequest(
                        "list_indices",
                        Map.of("indexPattern", "*")
                )
        );

        System.out.println(result);
        System.out.println("Stdio MCP Initialized: " + init);


    }
}
