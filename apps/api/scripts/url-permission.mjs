// Allows invocation only through the function URL (the AWS CLI v2.28 cannot set this condition)
import { LambdaClient, AddPermissionCommand } from '@aws-sdk/client-lambda';
const [fn, region] = process.argv.slice(2);
await new LambdaClient({ region }).send(new AddPermissionCommand({
  FunctionName: fn, StatementId: 'url-invoke', Action: 'lambda:InvokeFunction', Principal: '*', InvokedViaFunctionUrl: true,
}));
