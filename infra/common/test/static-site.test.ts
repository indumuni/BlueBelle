import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { StaticSite } from "../src/index.ts";
import { tempDistDir, testStack } from "./helpers.ts";

test("private bucket behind CloudFront with SPA fallback", () => {
  const stack = testStack();
  new StaticSite(stack, "Site", { distDir: tempDistDir() });
  const t = Template.fromStack(stack);
  t.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true }),
  });
  t.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
  t.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: "index.html",
      CustomErrorResponses: Match.arrayWith([
        Match.objectLike({ ErrorCode: 404, ResponsePagePath: "/index.html" }),
      ]),
    }),
  });
  t.resourceCountIs("Custom::CDKBucketDeployment", 1);
});
