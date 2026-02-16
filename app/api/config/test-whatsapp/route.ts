import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { phoneNumberId, accessToken, testNumber } = await req.json();
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ valid: false, error: "Missing phone number ID or access token" });
    }

    // Verify credentials by fetching the phone number info
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ valid: false, error: err.error?.message || "Invalid credentials" });
    }

    const data = await res.json();
    const phoneDisplay = data.display_phone_number || data.verified_name || phoneNumberId;

    // Optionally send a test message
    if (testNumber) {
      const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: testNumber,
          type: "text",
          text: { body: "Hello from Synapse! Your WhatsApp integration is working." },
        }),
      });

      if (!sendRes.ok) {
        const sendErr = await sendRes.json().catch(() => ({}));
        return NextResponse.json({
          valid: true,
          phoneDisplay,
          testSent: false,
          testError: sendErr.error?.message || "Failed to send test message",
        });
      }

      return NextResponse.json({ valid: true, phoneDisplay, testSent: true });
    }

    return NextResponse.json({ valid: true, phoneDisplay });
  } catch (err: any) {
    console.error("Test WhatsApp error:", err);
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
