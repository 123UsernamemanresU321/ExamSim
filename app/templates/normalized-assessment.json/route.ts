import { normalizedJsonTemplate } from "@/lib/json-template";

export const dynamic = "force-static";

export function GET() {
  return Response.json(normalizedJsonTemplate, {
    headers: {
      "content-disposition": 'attachment; filename="exam-vault-normalized-assessment-template.json"',
    },
  });
}
