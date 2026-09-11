param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$knowledgeProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $knowledgeProjectRoot
try {
    $mavenArguments = @('-q', '-pl', 'my-ai-agent-station-study-app', '-am', 'test-compile',
        'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath',
        '-DskipTests', '-Dmdep.outputFile=target/knowledge-test-classpath.txt')
    if ($Offline) { $mavenArguments = @('-o') + $mavenArguments }
    & mvn @mavenArguments
    if ($LASTEXITCODE -ne 0) { throw '知识库测试编译或 classpath 解析失败' }

    # 项目现有 Surefire 配置跳过测试；不改旧 POM，显式运行新增 JUnit4 测试。
    # 模块 target/classes 排在缓存 jar 前面，始终验证当前工作区代码。
    $knowledgePaths = @()
    foreach ($module in @('api', 'types', 'domain', 'trigger', 'infrastructure', 'app')) {
        $knowledgePaths += Join-Path $knowledgeProjectRoot ('my-ai-agent-station-study-' + $module + '/target/classes')
    }
    $knowledgePaths += Join-Path $knowledgeProjectRoot 'my-ai-agent-station-study-app/target/test-classes'
    $knowledgePaths += (Get-Content 'my-ai-agent-station-study-app/target/knowledge-test-classpath.txt' -Raw).Trim()
    $knowledgeClasspath = ($knowledgePaths -join [IO.Path]::PathSeparator).Replace('\', '/')
    $argumentFile = Join-Path $knowledgeProjectRoot 'my-ai-agent-station-study-app/target/knowledge-test.args'
    $javaArguments = @('-Dfile.encoding=UTF-8', '--class-path', ('"' + $knowledgeClasspath + '"'),
        'org.junit.runner.JUnitCore',
        'com.lkh.test.knowledge.KnowledgeServiceTest',
        'com.lkh.test.knowledge.KnowledgeControllerTest',
        'com.lkh.test.knowledge.KnowledgeInfrastructureTest',
        'com.lkh.test.knowledge.KnowledgeFlowTest',
        'com.lkh.test.knowledge.KnowledgeBaseServiceTest',
        'com.lkh.test.knowledge.KnowledgeIsolationTest')
    # Java 参数文件避免 Windows 进程命令行长度上限。
    [IO.File]::WriteAllLines($argumentFile, $javaArguments, (New-Object Text.UTF8Encoding($false)))
    & java ('@' + $argumentFile)
    if ($LASTEXITCODE -ne 0) { throw '知识库测试失败' }
} finally { Pop-Location }
