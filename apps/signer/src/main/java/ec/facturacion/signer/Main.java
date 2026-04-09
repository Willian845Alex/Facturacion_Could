package ec.facturacion.signer;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Main {

    public static void main(String[] args) throws Exception {
        // Force stdout to UTF-8 so accented chars (É, Ó, etc.) are not corrupted
        // when Node.js reads them as UTF-8. On Windows, System.out defaults to Cp1252.
        System.setOut(new PrintStream(System.out, true, "UTF-8"));

        Gson gson = new Gson();
        // Redirect stderr so only JSON goes to stdout
        try {
            StringBuilder sb = new StringBuilder();
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(System.in, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
            String input = sb.toString().trim();

            JsonObject request = gson.fromJson(input, JsonObject.class);
            String xml = request.get("xml").getAsString();
            String p12Base64 = request.get("p12Base64").getAsString();
            String password = request.get("password").getAsString();

            byte[] p12Bytes = Base64.getDecoder().decode(p12Base64);

            XadesSigner signer = new XadesSigner();
            String signedXml = signer.sign(xml, p12Bytes, password);

            JsonObject response = new JsonObject();
            response.addProperty("success", true);
            response.addProperty("signedXml", signedXml);
            System.out.println(gson.toJson(response));

        } catch (Exception e) {
            JsonObject response = new JsonObject();
            response.addProperty("success", false);
            response.addProperty("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            System.out.println(gson.toJson(response));
        }
    }
}
