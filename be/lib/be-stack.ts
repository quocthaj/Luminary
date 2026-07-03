import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
// aws-events / aws-events-targets reserved for future EventBridge rules
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import * as path from 'path';

export class VietAIScholarStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // ============================================
    // 1. S3 BUCKETS
    // ============================================
    console.log('📦 Creating S3 buckets...');

    // Bucket for raw PDF uploads
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      bucketName: `vietai-uploads-${accountId}`,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
          prefix: 'temp/',
        },
      ],
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.PUT],
          allowedHeaders: ['Content-Type'],
          maxAge: 3000,
        },
      ],
    });

    // Bucket for processed results (Markdown)
    const resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
      bucketName: `vietai-results-${accountId}`,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // Cache 30 days
        },
      ],
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // Bucket for frontend SPA (React build)
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `vietai-frontend-${accountId}`,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA routing
    });

    // ============================================
    // 2. DYNAMODB TABLE
    // ============================================
    console.log('🗄️  Creating DynamoDB table...');

    const jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: 'vietai-jobs',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Auto-scale
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      // TTL: items must include 'expiresAt' as a Unix epoch timestamp (seconds)
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev; use RETAIN in prod
    });

    // GSI: userId + createdAt (for listing user's jobs)
    jobsTable.addGlobalSecondaryIndex({
      indexName: 'userIdIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table: vietai-quiz-shares (Dedicated table for public quiz share links)
    const quizSharesTable = new dynamodb.Table(this, 'QuizSharesTable', {
      tableName: 'vietai-quiz-shares',
      partitionKey: {
        name: 'shareId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Table: vietai-thesis-defense-sessions
    const thesisDefenseSessionsTable = new dynamodb.Table(this, 'ThesisDefenseSessionsTable', {
      tableName: 'vietai-thesis-defense-sessions',
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Table: vietai-user-competency-profile
    const userCompetencyProfileTable = new dynamodb.Table(this, 'UserCompetencyProfileTable', {
      tableName: 'vietai-user-competency-profile',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================
    // 3. IAM ROLE FOR LAMBDA
    // ============================================
    console.log('🔐 Creating Lambda IAM role...');

    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for VietAI Lambda Orchestrator',
    });

    // S3 permissions
    uploadsBucket.grantReadWrite(lambdaRole);   // cho phép cả put và get
    resultsBucket.grantReadWrite(lambdaRole);

    // DynamoDB permissions
    jobsTable.grantReadWriteData(lambdaRole);
    quizSharesTable.grantReadWriteData(lambdaRole);
    thesisDefenseSessionsTable.grantReadWriteData(lambdaRole);
    userCompetencyProfileTable.grantReadWriteData(lambdaRole);

    // Textract permissions (sync + async OCR fallback for PDF)
    lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'textract:DetectDocumentText',
          'textract:AnalyzeDocument',
          'textract:StartDocumentTextDetection',
          'textract:GetDocumentTextDetection',
        ],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      })
    );

    // Secrets Manager: reference existing secrets by name
    const groqSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GroqSecret', 'vietai/groq-api-key'
    );
    const geminiSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GeminiSecret', 'vietai/gemini-api-key'
    );
    const deepseekSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'DeepSeekSecret', 'viet-ai-scholar/deepseek-api-key'
    );
    const mistralSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'MistralSecret', 'viet-ai-scholar/mistral-api-key'
    );
    const qdrantSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'QdrantSecret', 'vietai/qdrant-config'
    );
    const geminiEmbedSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GeminiEmbedSecret', 'vietai/gemini-embedding-key'
    );
    const nomicSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'NomicSecret', 'vietai/nomic-api-key'
    );
    const googleTtsSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GoogleTtsSecret', 'vietai/google-tts'
    );

    // Grant Lambda read access to all secrets
    groqSecret.grantRead(lambdaRole);
    geminiSecret.grantRead(lambdaRole);
    deepseekSecret.grantRead(lambdaRole);
    mistralSecret.grantRead(lambdaRole);
    qdrantSecret.grantRead(lambdaRole);
    geminiEmbedSecret.grantRead(lambdaRole);
    nomicSecret.grantRead(lambdaRole);
    googleTtsSecret.grantRead(lambdaRole);

    // Grant fallback access for friendly secret names and suffixes to prevent AccessDeniedException
    lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:vietai/*`,
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:viet-ai-scholar/*`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // CloudWatch Logs
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess')
    );

    // ============================================
    // 4. LAMBDA FUNCTION
    // ============================================
    console.log('⚡ Creating Lambda function...');

    const orchestratorLambda = new lambdaNode.NodejsFunction(
      this,
      'OrchestratorLambda',
      {
        functionName: 'vietai-orchestrator',
        entry: path.join(__dirname, '../lambda/index.ts'), // esbuild tự bundle TS
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(600), // 10 min: đủ cho Textract async polling (~90s) + AI
        memorySize: 1024, // 1 GB for processing
        environment: {
          S3_UPLOADS_BUCKET: uploadsBucket.bucketName,
          S3_RESULTS_BUCKET: resultsBucket.bucketName,
          DYNAMODB_TABLE: jobsTable.tableName,
          QUIZ_SHARES_TABLE: quizSharesTable.tableName,
          THESIS_DEFENSE_SESSIONS_TABLE: thesisDefenseSessionsTable.tableName,
          USER_COMPETENCY_PROFILE_TABLE: userCompetencyProfileTable.tableName,
          GROQ_SECRET_ARN: groqSecret.secretName,
          GEMINI_SECRET_ARN: geminiSecret.secretName,
          DEEPSEEK_SECRET_ARN: deepseekSecret.secretName,
          MISTRAL_SECRET_ARN: mistralSecret.secretName,
          GEMINI_EMBEDDING_SECRET_ARN: geminiEmbedSecret.secretName,
          NOMIC_SECRET_ARN: nomicSecret.secretName,
          QDRANT_SECRET_ARN: qdrantSecret.secretName,
          AUTH_SECRET_SECRET_NAME: 'vietai/auth-secret',
          GOOGLE_TTS_SECRET_ARN: googleTtsSecret.secretName,
          GCP_TTS_API_KEY: process.env.GCP_TTS_API_KEY || '',
          // AWS_REGION is automatically available in Lambda runtime
        },
        description: 'Main orchestrator for PDF processing pipeline',
        bundling: {
          // pdfjs-dist chứa pre-built binaries → esbuild không bundle inline được
          // → đánh dấu external, copy thủ công từ node_modules local (không dùng npm)
          externalModules: ['@aws-sdk/*', '@smithy/*', 'pdfjs-dist'],
          commandHooks: {
            beforeBundling(_inputDir: string, _outputDir: string): string[] {
              return [];
            },
            beforeInstall(_inputDir: string, _outputDir: string): string[] {
              return [];
            },
            afterBundling(inputDir: string, outputDir: string): string[] {
              // Copy pdfjs-dist trực tiếp — không cần npm
              if (process.platform === 'win32') {
                const src = path.join(inputDir, 'node_modules', 'pdfjs-dist');
                const dest = path.join(outputDir, 'node_modules', 'pdfjs-dist');
                return [`xcopy /E /I /Q "${src}" "${dest}"`];
              }
              return [
                `mkdir -p "${outputDir}/node_modules/pdfjs-dist"`,
                `cp -r "${inputDir}/node_modules/pdfjs-dist/." "${outputDir}/node_modules/pdfjs-dist/"`,
              ];
            },
          },
        },
      }
    );

    // Orchestrator gets its own auto-created role to avoid circular dependency with State Machine.
    // (lambdaRole is shared by worker Lambdas; grantStartExecution would create a cycle
    //  if orchestrator also used lambdaRole → processingStateMachine → workers → lambdaRole)
    uploadsBucket.grantReadWrite(orchestratorLambda);
    resultsBucket.grantReadWrite(orchestratorLambda);
    jobsTable.grantReadWriteData(orchestratorLambda);
    quizSharesTable.grantReadWriteData(orchestratorLambda);
    thesisDefenseSessionsTable.grantReadWriteData(orchestratorLambda);
    userCompetencyProfileTable.grantReadWriteData(orchestratorLambda);
    groqSecret.grantRead(orchestratorLambda);
    geminiSecret.grantRead(orchestratorLambda);
    deepseekSecret.grantRead(orchestratorLambda);
    mistralSecret.grantRead(orchestratorLambda);
    qdrantSecret.grantRead(orchestratorLambda);
    nomicSecret.grantRead(orchestratorLambda);
    googleTtsSecret.grantRead(orchestratorLambda);
    orchestratorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:vietai-orchestrator`],
      effect: iam.Effect.ALLOW,
    }));
    orchestratorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
      effect: iam.Effect.ALLOW,
    }));
    orchestratorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'textract:DetectDocumentText',
        'textract:AnalyzeDocument',
        'textract:StartDocumentTextDetection',
        'textract:GetDocumentTextDetection',
      ],
      resources: ['*'],
      effect: iam.Effect.ALLOW,
    }));
    orchestratorLambda.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess')
    );

    // ============================================
    // 4b. STEP FUNCTION WORKER LAMBDAS
    // ============================================

    const extractLambda = new lambdaNode.NodejsFunction(this, 'ExtractLambda', {
      functionName: 'vietai-extract',
      entry: path.join(__dirname, '../lambda/handlers/extract.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(120),
      memorySize: 2048,
      environment: {
        S3_UPLOADS_BUCKET: uploadsBucket.bucketName,
        S3_RESULTS_BUCKET: resultsBucket.bucketName,
        DYNAMODB_TABLE: jobsTable.tableName,
      },
      description: 'Extract text from PDF using Textract',
      bundling: {
        externalModules: ['@aws-sdk/*', '@smithy/*', 'pdfjs-dist'],
        commandHooks: {
          beforeBundling(_inputDir: string, _outputDir: string): string[] {
            return [];
          },
          beforeInstall(_inputDir: string, _outputDir: string): string[] {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            if (process.platform === 'win32') {
              const src = path.join(inputDir, 'node_modules', 'pdfjs-dist');
              const dest = path.join(outputDir, 'node_modules', 'pdfjs-dist');
              return [`xcopy /E /I /Q "${src}" "${dest}"`];
            }
            return [
              `mkdir -p "${outputDir}/node_modules/pdfjs-dist"`,
              `cp -r "${inputDir}/node_modules/pdfjs-dist/." "${outputDir}/node_modules/pdfjs-dist/"`,
            ];
          },
        },
      },
    });

    const translateLambda = new lambdaNode.NodejsFunction(this, 'TranslateLambda', {
      functionName: 'vietai-translate',
      entry: path.join(__dirname, '../lambda/handlers/translate.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        S3_RESULTS_BUCKET: resultsBucket.bucketName,
        DYNAMODB_TABLE: jobsTable.tableName,
        GROQ_SECRET_ARN: groqSecret.secretName,
        GEMINI_SECRET_ARN: geminiSecret.secretName,
        DEEPSEEK_SECRET_ARN: deepseekSecret.secretName,
        MISTRAL_SECRET_ARN: mistralSecret.secretName,
      },
      description: 'Translate extracted text to Vietnamese',
    });

    const latexLambda = new lambdaNode.NodejsFunction(this, 'LaTeXLambda', {
      functionName: 'vietai-latex',
      entry: path.join(__dirname, '../lambda/handlers/latex.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        S3_RESULTS_BUCKET: resultsBucket.bucketName,
        DYNAMODB_TABLE: jobsTable.tableName,
        GROQ_SECRET_ARN: groqSecret.secretName,
        GEMINI_SECRET_ARN: geminiSecret.secretName,
      },
      description: 'Convert LaTeX math expressions in translated text',
    });

    const mergeLambda = new lambdaNode.NodejsFunction(this, 'MergeLambda', {
      functionName: 'vietai-merge',
      entry: path.join(__dirname, '../lambda/handlers/merge.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        S3_RESULTS_BUCKET: resultsBucket.bucketName,
        DYNAMODB_TABLE: jobsTable.tableName,
      },
      description: 'Merge translated chunks into final Markdown output',
    });

    const ingestLambda = new lambdaNode.NodejsFunction(this, 'IngestLambda', {
      functionName: 'vietai-ingest',
      entry: path.join(__dirname, '../lambda/handlers/ingest.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(120),
      memorySize: 512,
      environment: {
        S3_RESULTS_BUCKET: resultsBucket.bucketName,
        DYNAMODB_TABLE: jobsTable.tableName,
        GEMINI_SECRET_ARN: geminiSecret.secretName,
        GEMINI_EMBEDDING_SECRET_ARN: geminiEmbedSecret.secretName,
        NOMIC_SECRET_ARN: nomicSecret.secretName,
        QDRANT_SECRET_ARN: qdrantSecret.secretName,
      },
      description: 'Ingest bilingual Markdown and upsert vectors to Qdrant Cloud',
    });

    // ============================================
    // 5. STEP FUNCTIONS STATE MACHINE
    // ============================================
    console.log('🔄 Creating Step Functions State Machine...');

    const extractTask = new tasks.LambdaInvoke(this, 'ExtractTask', {
      lambdaFunction: extractLambda,
      outputPath: '$.Payload',
      comment: 'Extract text from PDF using Textract',
    });

    const translateChunkTask = new tasks.LambdaInvoke(this, 'TranslateChunkTask', {
      lambdaFunction: translateLambda,
      outputPath: '$.Payload',
    });

    const mapState = new sfn.Map(this, 'TranslateMapState', {
      maxConcurrency: 5,
      itemsPath: sfn.JsonPath.stringAt('$.chunks'),
      resultPath: '$.translatedChunks',
      comment: 'Translate each text chunk in parallel',
    });
    mapState.itemProcessor(translateChunkTask);

    const latexTask = new tasks.LambdaInvoke(this, 'LaTeXTask', {
      lambdaFunction: latexLambda,
      outputPath: '$.Payload',
      comment: 'Process LaTeX math expressions',
    });

    const parallelState = new sfn.Parallel(this, 'ParallelProcessing', {
      resultPath: '$.parallelResults',
      comment: 'Translate chunks and process LaTeX in parallel',
    });
    parallelState.branch(mapState);
    parallelState.branch(latexTask);

    const mergeTask = new tasks.LambdaInvoke(this, 'MergeTask', {
      lambdaFunction: mergeLambda,
      outputPath: '$.Payload',
      comment: 'Merge translated chunks into final Markdown output',
    });

    const ingestTask = new tasks.LambdaInvoke(this, 'IngestTask', {
      lambdaFunction: ingestLambda,
      outputPath: '$.Payload',
      comment: 'Ingest bilingual Markdown and upsert vectors to Qdrant Cloud',
    });

    const definition = extractTask
      .next(parallelState)
      .next(mergeTask)
      .next(ingestTask);

    const processingStateMachine = new sfn.StateMachine(this, 'ProcessingStateMachine', {
      stateMachineName: 'vietai-processing-pipeline',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(15),
      comment: 'PDF processing pipeline: extract → (translate map + latex) → merge',
    });

    // Grant orchestratorLambda permission to start executions
    processingStateMachine.grantStartExecution(orchestratorLambda);
    orchestratorLambda.addEnvironment('STATE_MACHINE_ARN', processingStateMachine.stateMachineArn);

    // S3 trigger: when PDF uploaded, trigger Lambda
    uploadsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(orchestratorLambda),
      { prefix: 'uploads/' }
    );

    // ============================================
    // 5. API GATEWAY
    // ============================================
    console.log('🌐 Creating API Gateway...');

    const api = new apigateway.RestApi(this, 'VietAIAPI', {
      restApiName: 'vietai-scholar-api',
      description: 'API for VietAI Scholar Assistant',
      deployOptions: {
        stageName: 'dev',
        throttlingRateLimit: 100,   // requests per second
        throttlingBurstLimit: 200,  // max concurrent requests
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // For dev; restrict in prod
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // ============================================
    // JWT LAMBDA AUTHORIZER
    // ============================================
    console.log('🔒 Creating Lambda Authorizer...');

    const authorizerLambda = new lambdaNode.NodejsFunction(this, 'JwtAuthorizerLambda', {
      functionName: 'vietai-jwt-authorizer',
      entry: path.join(__dirname, '../lambda/authorizer.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(5),
      environment: {
        AUTH_SECRET_SECRET_NAME: 'vietai/auth-secret',
      },
    });

    const authSecret = secretsmanager.Secret.fromSecretNameV2(this, 'AuthSecret', 'vietai/auth-secret');
    authSecret.grantRead(authorizerLambda);
    authSecret.grantRead(orchestratorLambda);

    const authorizer = new apigateway.TokenAuthorizer(this, 'JwtAuthorizer', {
      handler: authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      // TODO(prod): tăng lên 300s trước khi deploy production để giảm latency và chi phí Lambda invocations
      resultsCacheTtl: cdk.Duration.seconds(0),
    });

    // ============================================
    // CẤP QUYỀN INVOKE CHO API GATEWAY
    // ============================================
    orchestratorLambda.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: api.arnForExecuteApi(),
    });

    // ============================================
    // API Endpoint 1: POST /upload
    // Returns: { uploadUrl, jobId }
    // ============================================
    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, {
        proxy: true, // Lambda nhận full HTTP request, tự xử lý response
      })
    );

    // ============================================
    // API Endpoint 2: GET /job/{jobId}
    // Returns: { status, s3OutputKey, error? }
    // ============================================
    const jobResource = api.root.addResource('job');
    const jobIdResource = jobResource.addResource('{jobId}');
    jobIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, {
        proxy: true,
      })
    );

    // ============================================
    // API Endpoint 2.5: POST /job/{jobId}/reprocess
    // Returns: { message } — restarts translation pipeline
    // ============================================
    const reprocessResource = jobIdResource.addResource('reprocess');
    reprocessResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 2.6: POST /job/{jobId}/chat
    // Returns: { answer } — RAG QA chat assistant
    // ============================================
    const chatResource = jobIdResource.addResource('chat');
    chatResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 2.7: POST /job/{jobId}/quiz
    // Returns: { questions } — AI quiz generator
    // ============================================
    const quizResource = jobIdResource.addResource('quiz');
    quizResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );
    quizResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 2.7b: POST /job/{jobId}/share/quiz
    // Returns: { shareId, shareUrl, expiresAt } — Share Quiz Link Generator
    // ============================================
    const shareResource = jobIdResource.addResource('share');
    const shareQuizResource = shareResource.addResource('quiz');
    shareQuizResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
        methodResponses: [{ statusCode: '200' }],
      }
    );

    // ============================================
    // API Endpoint 2.7c: GET /share/quiz/{shareId} (Public Endpoint with EDoS Throttling)
    // Returns: { downloadUrl, count, expiresAt } — S3 Pre-signed URL for Quiz
    // ============================================
    const publicShareResource = api.root.addResource('share');
    const publicShareQuizResource = publicShareResource.addResource('quiz');
    const publicShareIdResource = publicShareQuizResource.addResource('{shareId}');
    publicShareIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        // Public endpoint, no authorizer
      }
    );
 
    // ============================================
    // API Endpoint 2.8: POST /job/{jobId}/flashcard
    // Returns: { status } — AI flashcard generator
    // ============================================
    const flashcardResource = jobIdResource.addResource('flashcard');
    flashcardResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );
    flashcardResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 2.9: POST & GET /job/{jobId}/mindmap
    // Returns: { status } — AI mindmap generator
    // ============================================
    const mindmapResource = jobIdResource.addResource('mindmap');
    mindmapResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );
    mindmapResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 2.10: POST & GET /job/{jobId}/podcast
    // Returns: { status } — AI podcast generator
    // ============================================
    const podcastResource = jobIdResource.addResource('podcast');
    podcastResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );
    podcastResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 3: GET /result/{jobId}
    // Returns: { downloadUrl } — presigned S3 URL for analysis.md
    // ============================================
    const resultResource = api.root.addResource('result');
    const resultJobIdResource = resultResource.addResource('{jobId}');
    resultJobIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true })
    );

    // ============================================
    // API Endpoint 4: GET /jobs
    // Returns: { jobs: JobStatus[] }
    // ============================================
    const jobsResource = api.root.addResource('jobs');
    jobsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 5: POST /synthesis
    // Returns: { report } — Cross-Paper Synthesis Report
    // ============================================
    const synthesisResource = api.root.addResource('synthesis');
    synthesisResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 5.1: POST /synthesis/chat
    // Returns: { answer } — Cross-Paper RAG Chat
    // ============================================
    const synthesisChatResource = synthesisResource.addResource('chat');
    synthesisChatResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 5.2: POST & GET /explore
    // Returns: { status } — Explore Mode Topic-Based Generation
    // ============================================
    const exploreResource = api.root.addResource('explore');
    exploreResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );
    const exploreJobIdResource = exploreResource.addResource('{jobId}');
    exploreJobIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // API Endpoint 5.7: Thesis Defense & Research Copilot
    // ============================================
    const defenseResource = exploreResource.addResource('defense');
    const defenseSessionResource = defenseResource.addResource('session');
    
    // POST /explore/defense/session (Khởi tạo phiên bảo vệ)
    defenseSessionResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // POST /explore/defense/answer (Gửi câu trả lời và chạy reasoning loop)
    const defenseAnswerResource = defenseResource.addResource('answer');
    defenseAnswerResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // POST /explore/defense/session/close (Kết thúc phiên, chạy extract+update)
    const defenseCloseResource = defenseSessionResource.addResource('close');
    defenseCloseResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // GET /explore/copilot/suggest (Lấy gợi ý Research Copilot)
    const copilotResource = exploreResource.addResource('copilot');
    const copilotSuggestResource = copilotResource.addResource('suggest');
    copilotSuggestResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(orchestratorLambda, { proxy: true }),
      {
        authorizer,
      }
    );

    // ============================================
    // OUTPUTS
    // ============================================
    new cdk.CfnOutput(this, 'UploadsBucketOutput', {
      value: uploadsBucket.bucketName,
      description: 'S3 bucket for PDF uploads',
      exportName: 'VietAI-UploadsBucket',
    });

    new cdk.CfnOutput(this, 'ResultsBucketOutput', {
      value: resultsBucket.bucketName,
      description: 'S3 bucket for processed results',
      exportName: 'VietAI-ResultsBucket',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableOutput', {
      value: jobsTable.tableName,
      description: 'DynamoDB table for job tracking',
      exportName: 'VietAI-JobsTable',
    });

    new cdk.CfnOutput(this, 'APIEndpointOutput', {
      value: api.url,
      description: 'API Gateway endpoint',
      exportName: 'VietAI-APIEndpoint',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionOutput', {
      value: orchestratorLambda.functionName,
      description: 'Lambda Orchestrator function name',
      exportName: 'VietAI-LambdaFunction',
    });
  }
}