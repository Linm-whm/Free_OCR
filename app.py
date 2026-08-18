from flask import Flask

from routes.ocr_routes import bp as ocr_bp
from routes.page_routes import bp as page_bp
from routes.template_routes import bp as template_bp
from routes.upload_routes import bp as upload_bp


def create_app():
    app = Flask(__name__, static_folder="static")
    app.register_blueprint(page_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(template_bp)
    app.register_blueprint(ocr_bp)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
