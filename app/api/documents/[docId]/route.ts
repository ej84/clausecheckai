// app/api/documents/[docId]/route.ts
// Deletes a document's vectors from Pinecone (called before Supabase delete)

import { NextRequest, NextResponse } from "next/server";
import { getNamespacedIndex, index } from "@/lib/pinecone";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  // 1. Auth check
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Next.js 15+: params is a Promise — must be awaited
  const { docId } = await params;

  if (!docId) {
    return NextResponse.json({ error: "docId is required." }, { status: 400 });
  }

  // 2. Verify document belongs to this user
  const { data: doc, error: docError } = await supabaseAdmin
    .from("documents")
    .select("id, chunk_count")
    .eq("id", docId)
    .eq("user_id", user.id)
    .single();

  if (docError || !doc) {
    return NextResponse.json(
      { error: "Document not found or access denied." },
      { status: 404 }
    );
  }

  // 3. Delete vectors from Pinecone
  try {
    const chunkCount = doc.chunk_count as number;
    const vectorIds = Array.from(
      { length: chunkCount },
      (_, i) => `${docId}#${i}`
    );

    // Try namespaced index first, fall back to default index
    try {
      const nsIndex = getNamespacedIndex(user.id);
      await nsIndex.deleteMany(vectorIds);
      console.log(`Deleted ${vectorIds.length} vectors from namespace ${user.id}`);
    } catch {
      await index.deleteMany(vectorIds);
      console.log(`Deleted ${vectorIds.length} vectors from default index`);
    }
  } catch (e) {
    console.error("Pinecone delete error:", e);
    return NextResponse.json(
      {
        warning: "Document metadata will be deleted but vector cleanup failed. Orphaned vectors may remain.",
        docId,
      },
      { status: 207 }
    );
  }

  return NextResponse.json({ success: true, docId });
}